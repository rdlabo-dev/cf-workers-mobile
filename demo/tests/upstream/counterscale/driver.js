(async () => {
  const report = (data) =>
    fetch("/__acceptance/report", {
      method: "POST",
      body: JSON.stringify(data),
    });
  const wait = async (f) => {
    const end = Date.now() + 30000;
    while (!f()) {
      if (Date.now() > end) throw Error("Timed out: " + f);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  try {
    if (location.pathname === "/") {
      await wait(() => document.querySelector('input[name="password"]'));
      const input = document.querySelector('input[name="password"]');
      input.value = "wrong-password";
      document.querySelector('button[type="submit"]').click();
      await wait(() => document.body.innerText.includes("Invalid password"));
      input.value = "acceptance-password";
      document.querySelector('button[type="submit"]').click();
      await wait(() => location.pathname === "/dashboard");
    }
    if (acceptanceSite) {
      if (new URL(location.href).searchParams.get("site") !== acceptanceSite) {
        location.assign(
          "/dashboard?site=" +
            encodeURIComponent(acceptanceSite) +
            "&interval=1d",
        );
        return;
      }
      await wait(
        () =>
          document.body.innerText.includes("Visitors") &&
          document.body.innerText.includes("Views"),
      );
      const stats = await fetch(
        "/resources/stats?" +
          new URLSearchParams({
            site: acceptanceSite,
            interval: "1d",
            timezone: "UTC",
          }),
      );
      if (!stats.ok) throw Error("Analytics stats returned " + stats.status);
      const counts = await stats.json();
      if (counts.views !== 3 || counts.visitors !== 1)
        throw Error(
          "Unexpected real analytics counts: " + JSON.stringify(counts),
        );
      const displayedCount = (label) =>
        [...document.querySelectorAll(".text-4xl")]
          .find(
            (element) =>
              element.previousElementSibling?.textContent.trim() === label,
          )
          ?.textContent.trim();
      await wait(
        () =>
          displayedCount("Views") === "3" && displayedCount("Visitors") === "1",
      );
    } else
      await wait(() =>
        document.body.innerText.includes(
          "Missing Cloudflare Account ID configuration.",
        ),
      );
    if (document.cookie.includes("__counterscale_token"))
      throw Error("HttpOnly token exposed");
    const home = await fetch("/");
    if (!(await home.text()).includes("Go to Dashboard"))
      throw Error("Authenticated session missing");
    await report({
      stage: "complete",
      platform: window.Capacitor?.getPlatform?.() ?? "browser",
      scope: acceptanceSite ? "live-analytics" : "authentication-only",
    });
  } catch (error) {
    await report({
      stage: "failure",
      error: String(error),
      text: document.body.innerText,
    });
  }
})();
