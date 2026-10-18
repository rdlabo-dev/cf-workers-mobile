// An ordinary JavaScript Worker: no capacitor-workers import, annotations, or migration API.
import { Hono } from "hono";

const app = new Hono();
const readSQL = "SELECT owner, value FROM private_counters WHERE owner = ?";
async function readCounter(db, owner) {
  return db.prepare(readSQL).bind(owner).first();
}

app.use("*", async (c, next) => {
  await next();
  c.header("x-worker-middleware", "once");
});
app.get("/", (c) => c.html("<h1>Existing Worker UI</h1>"));
app.get("/health", (c) => c.json({ ok: true }));
app.get("/api/slow", async (c) => {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return c.json(await c.env.DB.prepare("SELECT 1 AS value").first());
});
app.get("/api/counters/:owner", async (c) => {
  // Existing server authentication is kept in the existing route.
  if (c.req.header("authorization") !== `Bearer test-${c.req.param("owner")}`)
    return c.json({ error: "Unauthorized" }, 401);
  return c.json(await readCounter(c.env.DB, c.req.param("owner")));
});
app.post("/api/counters/:owner", async (c) => {
  if (c.req.header("authorization") !== `Bearer test-${c.req.param("owner")}`)
    return c.json({ error: "Unauthorized" }, 401);
  const { increment } = await c.req.json();
  if (!Number.isSafeInteger(increment))
    return c.json({ error: "Invalid increment" }, 400);
  await c.env.DB.prepare(
    "UPDATE private_counters SET value = value + ? WHERE owner = ?",
  )
    .bind(increment, c.req.param("owner"))
    .run();
  return c.json(await readCounter(c.env.DB, c.req.param("owner")), 201);
});
export default app;
