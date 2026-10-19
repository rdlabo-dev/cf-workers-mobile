(async () => {
  const report = (data) =>
    fetch("/__acceptance/report", {
      method: "POST",
      body: JSON.stringify(data),
    });
  const wait = async (f) => {
    const end =
      Date.now() + (globalThis.__pknotesManualSubmission ? 180000 : 30000);
    while (!f()) {
      if (Date.now() > end) throw Error("Timed out: " + f);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  try {
    await wait(() => document.querySelector('[role="tab"]'));
    [...document.querySelectorAll('[role="tab"]')]
      .find((e) => e.textContent === "Create account")
      .click();
    await wait(
      () =>
        Object.getOwnPropertyDescriptor(
          document.querySelector("input") ?? {},
          "value",
        )?.set,
    );
    const input = document.querySelector("input");
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(input, "acceptance");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    const button = document.querySelector('button[type="submit"]');
    let trustedSubmission = false;
    button.addEventListener(
      "click",
      (event) => {
        trustedSubmission = event.isTrusted;
      },
      { once: true },
    );
    if (globalThis.__pknotesManualSubmission)
      await report({ stage: "ready-for-tap" });
    else button.click();
    await wait(() => document.querySelector(".error"));
    await report({
      stage: "complete",
      platform: window.Capacitor?.getPlatform?.() ?? "browser",
      error: document.querySelector(".error").textContent,
      trustedSubmission,
    });
  } catch (error) {
    await report({
      stage: "failure",
      error: String(error),
      text: document.body.innerText,
    });
  }
})();
