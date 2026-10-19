(async () => {
  if (window.__openNextAcceptance) return;
  window.__openNextAcceptance = true;
  const wait = async (check) => {
    const end = Date.now() + 15000;
    while (!check()) {
      if (Date.now() > end) throw new Error("Timed out: " + check);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  const report = async (stage, extra = {}) =>
    fetch("/__acceptance/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stage,
        path: location.pathname,
        cookieVisible: document.cookie.includes("demo_session"),
        release: document.querySelector("main")?.dataset.release,
        ...extra,
      }),
    });
  const config = await (await fetch("/__acceptance/config")).json();
  if (sessionStorage.getItem("opennext-run") !== config.id) {
    sessionStorage.removeItem("opennext-phase");
    sessionStorage.setItem("opennext-run", config.id);
  }
  const click = (selector) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error("Missing " + selector);
    element.click();
  };
  const heading = (text) => document.querySelector("h1")?.textContent === text;
  try {
    await report("plugin", {
      mode: config.mode,
      ...(await window.checkNativePlugin()),
    });
    if (config.mode !== "flow") {
      if (location.pathname !== "/account") {
        location.href = "/account";
        return;
      }
      if (config.mode === "restart") {
        await wait(() => document.querySelector("#owner"));
        await report("restart", {
          owner: document.querySelector("#owner").textContent,
        });
      } else if (config.mode === "logout" && !heading("Sign in"))
        click('form[action="/api/session"] button');
      else {
        await wait(() => heading("Sign in"));
        await report(config.mode);
      }
      return;
    }
    let phase = sessionStorage.getItem("opennext-phase") || "home";
    if (phase === "home") {
      await wait(() => heading("OpenNext in Capacitor"));
      // A click before React hydrates is ignored; repeat only while the count is zero.
      await wait(() => {
        if (document.querySelector("#counter")?.textContent === "Count: 1")
          return true;
        click("#counter");
        return false;
      });
      await wait(() => document.querySelector("img")?.naturalWidth > 0);
      if (getComputedStyle(document.querySelector("main")).maxWidth !== "640px")
        throw new Error("CSS missing");
      const message =
        config.execution === "routes"
          ? (await (await fetch("/api/message")).json()).message
          : undefined;
      await report("hydrated", { message });
      // A changed Next build can replace the document instead of completing a
      // soft RSC navigation. Resume each phase in the new document as well.
      sessionStorage.setItem("opennext-phase", "details");
      click('a[href="/details"]');
      phase = "details";
    }
    if (phase === "details") {
      await wait(
        () =>
          heading("Details") ||
          sessionStorage.getItem("opennext-phase") !== "details",
      );
      // A bfcache-restored home document resumes this old pending wait after
      // the replacement document has already completed the details phase.
      if (sessionStorage.getItem("opennext-phase") === "details") {
        await report("plugin", {
          mode: config.mode,
          ...(await window.checkNativePlugin()),
        });
        await report("details");
        sessionStorage.setItem("opennext-phase", "back");
        history.back();
      }
      phase = sessionStorage.getItem("opennext-phase");
    }
    if (phase === "back") {
      await wait(() => heading("OpenNext in Capacitor"));
      sessionStorage.setItem("opennext-phase", "login");
      click('a[href="/account"]');
      phase = "login";
    }
    if (phase === "login") {
      await wait(() => heading("Sign in"));
      document.querySelector('input[name="password"]').value = "demo";
      sessionStorage.setItem("opennext-phase", "save");
      click('form[action="/api/session"] button');
      return;
    }
    if (phase === "save") {
      await wait(() => document.querySelector("#owner"));
      if (document.querySelector("#owner").textContent !== "alice")
        throw new Error("Wrong session");
      const forged = await fetch("/api/notes", {
        method: "POST",
        body: new URLSearchParams({
          value: "Forged native note",
          csrf: "invalid",
        }),
      });
      if (forged.status !== 403) throw new Error("Invalid CSRF was accepted");
      await report("csrf-rejected", { status: forged.status });
      document.querySelector('input[name="value"]').value = "Native note";
      sessionStorage.setItem("opennext-phase", "done");
      click('form[action="/api/notes"] button');
      return;
    }
    if (phase === "done") {
      await wait(
        () =>
          document.querySelector("#saved-note")?.textContent === "Native note",
      );
      await report("complete", {
        owner: document.querySelector("#owner").textContent,
      });
    }
  } catch (error) {
    await report("failure", {
      error: String(error),
      html: document.body.innerText,
    });
  }
})();
