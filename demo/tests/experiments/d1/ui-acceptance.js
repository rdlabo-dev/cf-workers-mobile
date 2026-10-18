// Test-only DOM driver. It activates real forms and links in the rendered WebView.
(async () => {
  const connection = await (await fetch("/acceptance-run.json")).json();
  const reportOrigin = `https://${navigator.userAgent.includes("Android") ? "10.0.2.2" : "127.0.0.1"}:${connection.port}`;
  const config = await (
    await fetch(reportOrigin + "/__ui_config", { cache: "no-store" })
  ).json();
  if (sessionStorage.getItem("acceptance-run") !== config.id) {
    sessionStorage.clear();
    sessionStorage.setItem("acceptance-run", config.id);
  }
  const report = async (stage, extra = {}) => {
    const value = {
      run: config.id,
      stage,
      path: location.pathname,
      asset: document.querySelector("#asset-state")?.textContent,
      styled:
        getComputedStyle(document.querySelector("main")).maxWidth === "480px",
      cookieVisible: document.cookie.includes("cw_session"),
      ...extra,
    };
    await fetch(reportOrigin + "/__ui_report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(value),
    });
  };
  const phase = sessionStorage.getItem("acceptance-phase") || "start";
  const click = (selector) => {
    const element = document.querySelector(selector);
    if (!element) throw Error("Missing " + selector);
    element.click();
  };
  if (config.mode === "logout") {
    if (location.pathname === "/ui/login") await report("logout");
    else click('form[action="/ui/logout"] button');
    return;
  }
  if (config.mode === "loggedout") {
    await report("loggedout");
    return;
  }
  if (config.mode === "restart") {
    await report("restart", {
      account: document.querySelector("#account")?.textContent,
      value: document.querySelector("#value")?.textContent,
    });
    return;
  }
  if (location.pathname === "/ui/login") {
    if (phase === "logout") {
      await report("logout");
      sessionStorage.setItem("acceptance-phase", "done");
      return;
    }
    await report("login");
    sessionStorage.setItem("acceptance-phase", "login");
    document.querySelector('input[name="account"]').value = "alice";
    click('button[type="submit"]');
    return;
  }
  if (location.pathname === "/ui/account") {
    if (phase === "start") {
      // A prior run's session is cleared through the application's normal logout.
      sessionStorage.setItem("acceptance-phase", "reset");
      click('form[action="/ui/logout"] button');
      return;
    }
    if (phase === "login") {
      await report("account", {
        account: document.querySelector("#account").textContent,
      });
      sessionStorage.setItem("acceptance-phase", "save");
      document.querySelector('input[name="value"]').value = String(
        config.value,
      );
      click('form[action="/ui/save"] button');
      return;
    }
    if (phase === "save") {
      await report("saved", {
        value: document.querySelector("#value").textContent,
      });
      sessionStorage.setItem("acceptance-phase", "details");
      click('a[href="/ui/details"]');
      return;
    }
    if (phase === "back") {
      await report("complete", {
        value: document.querySelector("#value").textContent,
        account: document.querySelector("#account").textContent,
      });
      sessionStorage.setItem("acceptance-phase", "done");
      return;
    }
  }
  if (location.pathname === "/ui/details") {
    await report("details");
    sessionStorage.setItem("acceptance-phase", "back");
    click('a[href="/ui/account"]');
  }
})().catch((error) => {
  document.body.append(String(error));
  console.error("D1_UI_FAILURE", error);
});
