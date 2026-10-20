export default {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    let title = path === "/next" ? "Worker Next" : "Worker Home";
    if (request.method === "POST") {
      const form = await request.formData();
      title = `Posted ${form.get("value") === "verified" ? "verified" : "invalid"}`;
    }
    return new Response(
      `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<h1>${title}</h1><p id="path">${path}</p><a href="/next">Next</a>
<form action="/submit" method="post"><input name="value" value="verified"><button>Submit</button></form>`,
      { headers: { "content-type": "text/html; charset=utf-8" } },
    );
  },
};
