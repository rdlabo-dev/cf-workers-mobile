// An existing cookie-session SSR Worker: no Capacitor APIs or migration wrappers.
import { Hono } from "hono";
const app = new Hono();
const page = (title, content) =>
  `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="/ui/app.css"></head><body><main><h1>${title}</h1>${content}<p id="asset-state">Loading UI script</p></main><script src="/ui/app.js"></script></body></html>`;
const session = (req) =>
  /(?:^|;\s*)cw_session=([^;]+)/.exec(req.header("cookie") || "")?.[1] || "";
app.get("/ui/login", (c) =>
  c.html(
    page(
      "Sign in",
      `<form method="post" action="/ui/login"><label>Account <input name="account" autocomplete="username" value="alice"></label><button type="submit">Sign in</button></form>`,
    ),
  ),
);
app.post("/ui/login", async (c) => {
  const body = await c.req.parseBody();
  if (body.account !== "alice") return c.text("Unknown test account", 401);
  const token = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO ui_sessions (token, owner) VALUES (?, ?)")
    .bind(token, "alice")
    .run();
  c.header(
    "Set-Cookie",
    `cw_session=${token}; Path=/ui; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
  );
  return c.redirect("/ui/account", 303);
});
app.get("/ui/account", async (c) => {
  const user = await c.env.DB.prepare(
    "SELECT owner FROM ui_sessions WHERE token = ?",
  )
    .bind(session(c.req))
    .first();
  if (!user) return c.redirect("/ui/login", 302);
  const row = await c.env.DB.prepare(
    "SELECT value FROM ui_notes WHERE owner = ?",
  )
    .bind(user.owner)
    .first();
  return c.html(
    page(
      "Account",
      `<p id="account">${user.owner}</p><p id="value">${row.value}</p><form method="post" action="/ui/save"><label>Value <input name="value" type="number" value="${row.value}"></label><button type="submit">Save</button></form><a href="/ui/details">Details</a><form method="post" action="/ui/logout"><button type="submit">Sign out</button></form>`,
    ),
  );
});
app.post("/ui/save", async (c) => {
  const user = await c.env.DB.prepare(
    "SELECT owner FROM ui_sessions WHERE token = ?",
  )
    .bind(session(c.req))
    .first();
  if (!user) return c.text("Unauthorized", 401);
  const body = await c.req.parseBody();
  const value = Number(body.value);
  if (!Number.isSafeInteger(value)) return c.text("Invalid value", 400);
  await c.env.DB.prepare(
    "UPDATE ui_notes SET value = ?, writes = writes + 1 WHERE owner = ?",
  )
    .bind(value, user.owner)
    .run();
  return c.redirect("/ui/account", 303);
});
app.get("/ui/details", (c) =>
  c.html(page("Details", '<a href="/ui/account">Back to account</a>')),
);
// Keep the server session valid: acceptance must prove cookie deletion itself.
app.post("/ui/logout", (c) => {
  c.header(
    "Set-Cookie",
    "cw_session=; Path=/ui; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
  );
  return c.redirect("/ui/login", 303);
});
export default app;
