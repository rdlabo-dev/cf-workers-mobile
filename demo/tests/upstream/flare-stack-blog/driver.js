(async () => {
  const report = (data) =>
    fetch("/__acceptance/report", {
      method: "POST",
      body: JSON.stringify(data),
    });
  const wait = async (f) => {
    const end = Date.now() + 30000;
    while (!f()) {
      if (failures.length)
        throw Error("Page resources failed: " + failures.join(", "));
      if (Date.now() > end) throw Error("Timed out: " + f);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const failures = [];
  const recoveries = [];
  addEventListener(
    "error",
    (event) => {
      if (
        event.target instanceof HTMLScriptElement ||
        event.target instanceof HTMLLinkElement
      )
        failures.push(event.target.src || event.target.href);
      // The pinned original Worker also emits a recoverable locale mismatch.
      // Require functional hydration below; do not confuse it with resource loss.
      else if (event.message?.includes("Minified React error #418;"))
        recoveries.push(event.message);
      else if (event.message) failures.push(event.message);
    },
    true,
  );
  addEventListener("unhandledrejection", (event) =>
    failures.push(String(event.reason)),
  );
  try {
    await wait(() => document.readyState === "complete");
    await wait(() => {
      const nav = document.querySelector(".public-navbar");
      return nav && getComputedStyle(nav).display === "flex";
    });
    const control = () =>
      [
        ...document.querySelectorAll(
          ".public-account-trigger, .public-mobile-trigger",
        ),
      ].find((button) => button.getClientRects().length > 0);
    let lastClick = 0;
    await wait(() => {
      if (control()?.getAttribute("aria-expanded") === "true") return true;
      if (Date.now() - lastClick > 500) {
        control()?.click();
        lastClick = Date.now();
      }
      return false;
    });
    await wait(() => document.querySelector("#public-navigation-panel"));
    control().click();
    await wait(() => control()?.getAttribute("aria-expanded") === "false");
    if (failures.length)
      throw Error("Page resources failed: " + failures.join(", "));
    if (location.pathname === "/") {
      const link = () =>
        [...document.querySelectorAll("a")].find((a) =>
          a.textContent.includes("Capacitor acceptance story"),
        );
      await wait(link);
      link().click();
      await wait(() => location.pathname.includes("acceptance"));
    }
    if (!location.pathname.includes("acceptance"))
      throw Error("Unexpected navigation: " + location.pathname);
    await wait(() =>
      document.body.innerText.includes("Native blog article body"),
    );
    if (failures.length)
      throw Error("Page resources failed: " + failures.join(", "));
    await report({
      stage: "complete",
      recoveries,
      platform: window.Capacitor?.getPlatform?.() ?? "browser",
    });
  } catch (error) {
    await report({
      stage: "failure",
      failures,
      recoveries,
      controls: [
        ...document.querySelectorAll(
          ".public-account-trigger, .public-mobile-trigger",
        ),
      ].map((button) => ({
        expanded: button.getAttribute("aria-expanded"),
        rectangles: button.getClientRects().length,
      })),
      error: String(error),
      text: document.body.innerText,
    });
  }
})();
