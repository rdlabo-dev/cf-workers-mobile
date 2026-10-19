// An ordinary Hyperdrive Worker. No Capacitor imports or alternate HTTP routes.
import { Hono } from "hono";
import mysql from "mysql2/promise";
const app = new Hono();
async function withDatabase(binding, run) {
  const connection = await mysql.createConnection({
    host: binding.host,
    port: binding.port,
    user: binding.user,
    password: binding.password,
    database: binding.database,
    disableEval: true,
  });
  try {
    return await run(connection);
  } finally {
    await connection.end();
  }
}
async function readCounter(connection, owner) {
  const [rows] = await connection.execute(
    "SELECT owner, value FROM private_counters WHERE owner = ?",
    [owner],
  );
  return rows[0];
}
// Header mutation belongs to the remote API; public rendering stays independent.
app.use("/api/*", async (c, next) => {
  await next();
  c.header("x-worker-middleware", "once");
});
app.get("/", (c) => c.html("<h1>Existing Worker UI</h1>"));
app.get("/health", (c) => c.json({ ok: true }));
app.get("/api/counters/:owner", async (c) => {
  if (c.req.header("authorization") !== `Bearer test-${c.req.param("owner")}`)
    return c.json({ error: "Unauthorized" }, 401);
  return c.json(
    await withDatabase(c.env.SQL, (db) =>
      readCounter(db, c.req.param("owner")),
    ),
  );
});
app.post("/api/counters/:owner", async (c) => {
  if (c.req.header("authorization") !== `Bearer test-${c.req.param("owner")}`)
    return c.json({ error: "Unauthorized" }, 401);
  const { increment } = await c.req.json();
  if (!Number.isSafeInteger(increment))
    return c.json({ error: "Invalid increment" }, 400);
  const row = await withDatabase(c.env.SQL, async (db) => {
    await db.beginTransaction();
    try {
      await db.execute(
        "UPDATE private_counters SET value = value + ? WHERE owner = ?",
        [increment, c.req.param("owner")],
      );
      const row = await readCounter(db, c.req.param("owner"));
      await db.commit();
      return row;
    } catch (error) {
      await db.rollback();
      throw error;
    }
  });
  return c.json(row, 201);
});
export default app;
