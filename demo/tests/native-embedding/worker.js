export default {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    let title = path === "/next" ? "Worker Next" : "Worker Home";
    if (path.startsWith("/network-")) {
      try {
        const response = await fetch(
          `http://127.0.0.1:18764/${path === "/network-drop" ? "drop" : "ok"}`,
          { signal: AbortSignal.timeout(5000) },
        );
        title =
          (await response.text()) === "network-ok"
            ? "Network recovered"
            : "Network unexpected";
      } catch {
        title = "Network interrupted";
      }
    }
    if (request.method === "POST") {
      const form = await request.formData();
      title = `Posted ${form.get("value") === "verified" ? "verified" : "invalid"}`;
    }
    return new Response(
      `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<h1>${title}</h1><p id="path">${path}</p><a href="/next">Next</a>
<p><a href="/network-ok">Check network</a> <a href="/network-drop">Interrupt network</a></p>
<form action="/submit" method="post"><input name="value" value="verified"><button>Submit</button></form>`,
      { headers: { "content-type": "text/html; charset=utf-8" } },
    );
  },
};
