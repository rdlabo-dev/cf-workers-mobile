(async () => {
  const report = (data) =>
    fetch("/__acceptance/report", {
      method: "POST",
      body: JSON.stringify(data),
    });
  const wait = async (check) => {
    const end = Date.now() + 30000;
    while (!check()) {
      if (Date.now() > end) throw Error("Timeout: " + check);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  window.addEventListener(
    "error",
    (e) =>
      void report({ stage: "failure", error: String(e.error ?? e.message) }),
  );
  window.addEventListener(
    "unhandledrejection",
    (e) => void report({ stage: "failure", error: String(e.reason) }),
  );
  try {
    if (location.pathname === "/") {
      await wait(
        () =>
          Object.getOwnPropertyDescriptor(
            document.querySelector("textarea") ?? {},
            "value",
          )?.set,
      );
      const input = document.querySelector("textarea");
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      ).set.call(input, "Capacitor encrypted acceptance");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 50));
      document.querySelector('button[type="submit"]').click();
    } else if (location.pathname.startsWith("/p/")) {
      await wait(() =>
        document
          .querySelector(".code-lines")
          ?.textContent.includes("Capacitor encrypted acceptance"),
      );
      if (!location.hash)
        throw Error("Encryption key was lost during navigation");
      await report({
        stage: "complete",
        id: location.pathname.split("/").pop(),
        platform: window.Capacitor?.getPlatform?.() ?? "browser",
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
