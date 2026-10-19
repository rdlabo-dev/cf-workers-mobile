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
      const link = () =>
        [...document.querySelectorAll("a")].find((a) =>
          a.textContent.includes("Capacitor acceptance story"),
        );
      await wait(link);
      link().click();
      return;
    }
    if (!location.pathname.startsWith("/i/"))
      throw Error("Unexpected navigation: " + location.pathname);
    await wait(() =>
      document.body.innerText.includes("Native feed article body"),
    );
    const rss = await fetch("/rss/");
    if (!rss.ok || !(await rss.text()).includes("Capacitor acceptance story"))
      throw Error("RSS content missing");
    await report({
      stage: "complete",
      platform: window.Capacitor?.getPlatform?.() ?? "browser",
    });
  } catch (error) {
    await report({
      stage: "failure",
      error: String(error),
      text: document.body.innerText,
    });
  }
})();
