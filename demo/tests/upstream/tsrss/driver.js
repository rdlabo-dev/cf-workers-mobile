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
  try {
    if (location.pathname === "/login") {
      const phase = sessionStorage.getItem("acceptance-phase");
      if (phase === "logout") {
        if (document.cookie.includes("tsrss_session"))
          throw Error("Session cookie exposed");
        await report({
          stage: "complete",
          platform: window.Capacitor?.getPlatform?.() ?? "browser",
        });
        return;
      }
      const input = document.querySelector('input[name="password"]');
      if (phase === "invalid") {
        if (!document.body.innerText.includes("Invalid password"))
          throw Error("Invalid password was accepted");
        await report({ stage: "invalid-password" });
        input.value = "acceptance-password";
        sessionStorage.setItem("acceptance-phase", "login");
      } else {
        input.value = "wrong-password";
        sessionStorage.setItem("acceptance-phase", "invalid");
      }
      input.form.requestSubmit();
      return;
    }
    if (sessionStorage.getItem("acceptance-phase") !== "login")
      throw Error("Protected page loaded before login");
    if (document.cookie.includes("tsrss_session"))
      throw Error("HttpOnly session exposed");
    await wait(
      () =>
        document.querySelector(".article-title")?.textContent ===
        "Capacitor acceptance article",
    );
    document.querySelector(".article-star").click();
    await wait(() => document.querySelector(".article-star.starred"));
    document.querySelector(".article-header").click();
    await wait(() =>
      document
        .querySelector(".article-content")
        ?.textContent.includes("Full article content"),
    );
    // Observe persistence through the real authenticated API before logging out.
    const article = await (await fetch("/api/articles/1")).json();
    if (!article.is_read || !article.is_starred)
      throw Error("Article state was not saved");
    sessionStorage.setItem("acceptance-phase", "logout");
    document.querySelector("#btn-logout").click();
  } catch (error) {
    await report({
      stage: "failure",
      error: String(error),
      text: document.body.innerText,
    });
  }
})();
