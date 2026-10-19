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
      await wait(
        () =>
          document.body.innerText.includes("All systems operational") &&
          document.body.innerText.includes("My API Monitor"),
      );
      const link = document.querySelector('a[href="/incidents"]');
      if (!link) throw Error("Missing incidents navigation");
      link.click();
      return;
    }
    if (location.pathname !== "/incidents")
      throw Error("Unexpected navigation: " + location.pathname);
    await wait(
      () => document.querySelector("input") && document.querySelector("button"),
    );
    const select = document.querySelector("input");
    select.click();
    await wait(() => document.querySelector('[role="option"]'));
    const option = [...document.querySelectorAll('[role="option"]')].find((e) =>
      e.textContent.includes("My API Monitor"),
    );
    if (!option) throw Error("Missing monitor filter");
    option.click();
    await wait(() => select.value === "My API Monitor");
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
