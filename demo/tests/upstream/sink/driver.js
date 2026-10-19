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
  const fill = (input, value) => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  try {
    await wait(() => document.querySelector("#token"));
    fill(document.querySelector("#token"), "native-sink-test-token");
    await new Promise((r) => setTimeout(r, 50));
    document.querySelector("#token").form.requestSubmit();
    await wait(() => location.pathname.endsWith("/dashboard/links"));
    await report({ stage: "login" });
    const create = () =>
      [...document.querySelectorAll("button")].find((b) =>
        /create link|new link/i.test(b.textContent),
      );
    await wait(create);
    create().click();
    await wait(() => document.querySelector('input[name="url"]'));
    fill(
      document.querySelector('input[name="url"]'),
      "https://example.com/capacitor-acceptance",
    );
    fill(document.querySelector('input[name="slug"]'), "capacitor-acceptance");
    await new Promise((r) => setTimeout(r, 50));
    document.querySelector('input[name="url"]').form.requestSubmit();
    await wait(
      () =>
        !document.querySelector('input[name="url"]') &&
        document.body.innerText.includes("capacitor-acceptance"),
    );
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
