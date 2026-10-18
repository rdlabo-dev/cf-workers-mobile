(() => {
  const observed = { fallback: false };
  const observer = new MutationObserver(() => {
    if (
      location.pathname === "/ssr" &&
      !observed.fallback &&
      document.body?.innerText.includes("Loading...") &&
      ![...document.querySelectorAll("h1")].some((h) =>
        h.textContent.startsWith("Time:"),
      )
    ) {
      observed.fallback = true;
      void report({ stage: "fallback" });
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  const wait = async (check) => {
    const deadline = Date.now() + 20000;
    while (!check()) {
      if (Date.now() > deadline) throw new Error("Timed out: " + check);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  const report = (data) =>
    fetch("/__acceptance/report", {
      method: "POST",
      body: JSON.stringify({ path: location.pathname, ...data }),
    });
  window.addEventListener(
    "load",
    async () => {
      try {
        if (location.pathname === "/server-actions") {
          const button = [...document.querySelectorAll("button")].find(
            (b) => b.textContent === "Fire Server Actions",
          );
          // Wait for hydration once; never replay an action to make the test pass.
          await new Promise((resolve) => setTimeout(resolve, 500));
          button.click();
          await wait(() =>
            document.body.innerText.includes(
              "Song: I'm never gonna give you up",
            ),
          );
          await report({ stage: "action" });
          const input = document.querySelector('input[name="query"]');
          input.value = "capacitor-upstream";
          input.form.requestSubmit();
          await wait(() =>
            document.body.innerText.includes(
              "Search Params via Props: capacitor-upstream",
            ),
          );
          await report({ stage: "form" });
          location.href = "/ssr";
        } else if (location.pathname === "/ssr") {
          await wait(() =>
            [...document.querySelectorAll("h1")].some((h) =>
              h.textContent.startsWith("Time:"),
            ),
          );
          observer.disconnect();
          await report({
            stage: "complete",
            fallback: observed.fallback,
            platform: window.Capacitor?.getPlatform?.() ?? "browser",
          });
        }
      } catch (error) {
        await report({
          stage: "failure",
          error: String(error),
          text: document.body?.innerText,
        });
      }
    },
    { once: true },
  );
})();
