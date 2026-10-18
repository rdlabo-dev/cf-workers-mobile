// Existing Workers application: no Capacitor imports or alternate binding APIs.
import { Hono } from "hono";
const app = new Hono();
app.get("/health", (c) => c.json({ local: true }));
app.use("/api/*", async (c, next) => {
  if (c.req.header("authorization") !== "Bearer test-owner")
    return c.text("Unauthorized", 401);
  await next();
});
app.put("/api/objects/:key", async (c) => {
  const object = await c.env.BUCKET.put(c.req.param("key"), c.req.raw.body, {
    httpMetadata: { contentType: "application/octet-stream" },
    customMetadata: { owner: "test-owner" },
  });
  return c.json({ etag: object.etag, size: object.size }, 201);
});
app.get("/api/objects/:key", async (c) => {
  const offset = c.req.query("offset"),
    etag = c.req.query("etag");
  const object = await c.env.BUCKET.get(c.req.param("key"), {
    ...(offset !== undefined
      ? { range: { offset: Number(offset), length: 3 } }
      : {}),
    ...(etag ? { onlyIf: { etagMatches: etag } } : {}),
  });
  if (!object) return c.text("Not found", 404);
  if (!("body" in object)) return c.body(null, 412);
  return new Response(object.body, {
    status: offset !== undefined ? 206 : 200,
    headers: {
      "content-type": object.httpMetadata.contentType,
      etag: object.httpEtag,
    },
  });
});
app.delete("/api/objects/:key", async (c) => {
  await c.env.BUCKET.delete(c.req.param("key"));
  return c.body(null, 204);
});
app.post("/api/multipart/:key", async (c) => {
  const upload = await c.env.BUCKET.createMultipartUpload(c.req.param("key"));
  return c.json({ uploadId: upload.uploadId }, 201);
});
app.put("/api/multipart/:key/:id", async (c) => {
  const upload = c.env.BUCKET.resumeMultipartUpload(
    c.req.param("key"),
    c.req.param("id"),
  );
  return c.json(await upload.uploadPart(1, c.req.raw.body));
});
app.post("/api/multipart/:key/:id", async (c) => {
  const upload = c.env.BUCKET.resumeMultipartUpload(
    c.req.param("key"),
    c.req.param("id"),
  );
  const object = await upload.complete(await c.req.json());
  return c.json({ size: object.size });
});
app.put("/api/kv/:key", async (c) => {
  await c.env.CLOUD_KV.put(c.req.param("key"), await c.req.text(), {
    metadata: { owner: "test-owner" },
    expirationTtl: 60,
  });
  return c.body(null, 204);
});
app.get("/api/kv/:key", async (c) =>
  c.json(await c.env.CLOUD_KV.getWithMetadata(c.req.param("key"))),
);
app.delete("/api/kv/:key", async (c) => {
  await c.env.CLOUD_KV.delete(c.req.param("key"));
  return c.body(null, 204);
});
app.get("/api/service", async (c) => {
  const response = await c.env.INTERNAL.fetch("https://internal.invalid/hello");
  return c.json({
    http: await response.text(),
    rpc: await c.env.RPC.add(2, 3),
  });
});
app.post("/api/jobs/:id", async (c) => {
  await c.env.JOBS.send({ id: c.req.param("id"), kind: "single" });
  await c.env.JOBS.sendBatch([
    { body: { id: c.req.param("id") + "-batch", kind: "batch" } },
  ]);
  return c.json({ accepted: true }, 202);
});
export default app;
