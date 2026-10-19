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
    await wait(() => document.body.innerText.includes("seed.txt"));
    if (sessionStorage.getItem("acceptance-written")) {
      await wait(() => document.body.innerText.includes("accepted.txt"));
      const file = await fetch("/webdav/accepted.txt");
      if ((await file.text()) !== "Capacitor WebDAV acceptance")
        throw Error("Saved file differs");
      await report({
        stage: "complete",
        platform: window.Capacitor?.getPlatform?.() ?? "browser",
      });
      return;
    }
    const denied = await fetch("/webdav/denied.txt", {
      method: "PUT",
      body: "unauthorized",
    });
    if (denied.status !== 401)
      throw Error("Unauthenticated write accepted: " + denied.status);
    const headers = {
      authorization: "Basic " + btoa("acceptance:test-password"),
    };
    const write = await fetch("/webdav/accepted.txt", {
      method: "PUT",
      headers: { ...headers, "content-type": "text/plain" },
      body: "Capacitor WebDAV acceptance",
    });
    if (!write.ok) throw Error("PUT failed: " + write.status);
    const listing = await fetch("/webdav/", {
      method: "PROPFIND",
      headers: { ...headers, depth: "1" },
    });
    if (
      listing.status !== 207 ||
      !(await listing.text()).includes("accepted.txt")
    )
      throw Error("PROPFIND failed");
    sessionStorage.setItem("acceptance-written", "1");
    location.reload();
  } catch (error) {
    await report({
      stage: "failure",
      error: String(error),
      text: document.body.innerText,
    });
  }
})();
