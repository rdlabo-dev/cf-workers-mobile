import { Hono } from "hono";
const app = new Hono();
app.get("/health", (c) => c.text("local-health"));
app.get("/assets", (c) => c.env.ASSETS.fetch(c.req.raw));
app.get("/spa/*", (c) => c.env.ASSETS.fetch(c.req.raw));
app.post("/counter/:name", async (c) => {
  if (c.req.header("authorization") !== "Bearer owner")
    return c.text("denied", 401);
  const stub = c.env.OBJECTS.getByName(c.req.param("name"));
  return c.json({
    count: await stub.increment(),
    marker: "private-do-operation",
  });
});
app.get("/counter/:name", async (c) => {
  if (c.req.header("authorization") !== "Bearer owner")
    return c.text("denied", 401);
  return c.env.OBJECTS.getByName(c.req.param("name")).fetch(
    "https://object.invalid/",
  );
});
export default app;
