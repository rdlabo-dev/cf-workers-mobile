(async () => {
  if (window.__localAcceptance) return;
  window.__localAcceptance = true;
  const wait = async (check) => {
    const end = Date.now() + 15000;
    while (!check()) {
      if (Date.now() > end) throw Error("Timed out: " + check);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  try {
    await wait(() => document.querySelector("#counter"));
    await wait(() => {
      if (document.querySelector("#counter").textContent === "Count: 1")
        return true;
      document.querySelector("#counter").click();
      return false;
    });
    await wait(() => document.querySelector("img")?.naturalWidth > 0);
    if (getComputedStyle(document.querySelector("main")).maxWidth !== "640px")
      throw Error("CSS missing");
    await fetch(REPORT_ORIGIN + "/__acceptance/report", {
      method: "POST",
      body: JSON.stringify({ stage: "local-hydrated" }),
    });
    document.querySelector('a[href="/details"]').click();
    await wait(() => document.querySelector("h1")?.textContent === "Details");
    history.back();
    await wait(
      () =>
        document.querySelector("h1")?.textContent === "OpenNext in Capacitor",
    );
    await fetch(REPORT_ORIGIN + "/__acceptance/report", {
      method: "POST",
      body: JSON.stringify({
        stage: "local-complete",
        elapsed: performance.now(),
      }),
    });
  } catch (error) {
    await fetch(REPORT_ORIGIN + "/__acceptance/report", {
      method: "POST",
      body: JSON.stringify({
        stage: "failure",
        error: String(error),
        path: location.href,
        body: document.body.innerText,
      }),
    });
  }
})();
