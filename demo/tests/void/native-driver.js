(async () => {
  const report = (data) =>
    fetch("/__acceptance/report", {
      method: "POST",
      body: JSON.stringify(data),
    });
  window.addEventListener(
    "error",
    (event) =>
      void report({
        stage: "failure",
        error: String(event.error ?? event.message),
      }),
  );
  window.addEventListener(
    "unhandledrejection",
    (event) => void report({ stage: "failure", error: String(event.reason) }),
  );
  const wait = async (check) => {
    const end = Date.now() + 20000;
    while (!check()) {
      if (Date.now() > end) throw Error("Timeout: " + check);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  try {
    await wait(() => document.querySelector("li strong")?.textContent);
    if (location.pathname === "/") {
      // React installs the controlled input accessor during hydration.
      await wait(
        () =>
          Object.getOwnPropertyDescriptor(
            document.querySelector("input"),
            "value",
          )?.set,
      );
      const input = document.querySelector("input");
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set.call(input, "Native Void message");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 50));
      await report({ stage: "rendered" });
      document.querySelector("button").click();
      await wait(() => document.body.innerText.includes("Native Void message"));
      await report({ stage: "action" });
      location.href = "/client-only";
    } else if (location.pathname === "/client-only") {
      await wait(() => document.body.innerText.includes("Native Void message"));
      await report({
        stage: "complete",
        platform: window.Capacitor?.getPlatform?.(),
      });
    }
  } catch (error) {
    await report({
      stage: "failure",
      error: String(error),
      text: document.body.innerText,
    });
  }
})();
