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
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  const fill = (input, value) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  try {
    if (!sessionStorage.getItem("acceptance-created")) {
      await wait(
        () => document.querySelectorAll('input[type="password"]').length === 2,
      );
      const inputs = [...document.querySelectorAll("form input")];
      fill(inputs[0], "acceptance");
      fill(inputs[1], "Acceptance-password-29");
      fill(inputs[2], "Acceptance-password-29");
      await new Promise((r) => setTimeout(r, 50));
      document.querySelector('button[type="submit"]').click();
      await wait(() => document.querySelector('button[aria-label="New note"]'));
      document.querySelector('button[aria-label="New note"]').click();
      await wait(() =>
        document.querySelector('input[aria-label="Note title"]'),
      );
      fill(
        document.querySelector('input[aria-label="Note title"]'),
        "Capacitor acceptance note",
      );
      document.querySelector('input[aria-label="Note title"]').blur();
      await wait(
        () =>
          document.body.innerText.includes("Capacitor acceptance note") ||
          document.querySelector('input[aria-label="Note title"]')?.value ===
            "Capacitor acceptance note",
      );
      // Reload only after the original autosave request has persisted server-side.
      const end = Date.now() + 15000;
      while (Date.now() < end) {
        const res = await fetch("/api/notes");
        const text = await res.text();
        if (text.includes("Capacitor acceptance note")) {
          sessionStorage.setItem("acceptance-created", "1");
          location.reload();
          return;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      throw Error("Note did not persist");
    }
    await wait(
      () =>
        document.body.innerText.includes("Capacitor acceptance note") ||
        document.querySelector('input[aria-label="Note title"]')?.value ===
          "Capacitor acceptance note",
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
