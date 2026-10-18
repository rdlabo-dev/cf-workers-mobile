import { createServer } from "node:https";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
const ui = process.argv.includes("--ui");
const root = fileURLToPath(
  new URL(
    ui ? "../../../artifacts/d1-native-ui/" : "../../../artifacts/d1-native/",
    import.meta.url,
  ),
);
await mkdir(root, { recursive: true });
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    "key.pem",
    "-out",
    "ca.pem",
    "-days",
    "2",
    "-subj",
    "/CN=Capacitor D1 Test",
    "-addext",
    "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:10.0.2.2",
    "-addext",
    "basicConstraints=critical,CA:TRUE",
  ],
  { cwd: root, stdio: "pipe" },
);
const fixture = fileURLToPath(
  new URL(ui ? "ui-worker.js" : "worker.js", import.meta.url),
);
const result = await build({
  stdin: {
    contents: `import app from ${JSON.stringify(fixture)}; let effects=0; export default { async fetch(req,env,ctx){effects++;const res=await app.fetch(req,env,ctx);res.headers.set('x-effect-total',String(effects));return res;} };`,
    resolveDir: root,
  },
  bundle: true,
  format: "esm",
  write: false,
});
const backend = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: result.outputFiles[0].text,
    compatibilityDate: "2026-10-01",
    d1Databases: ["DB"],
  }),
);
const db = await backend.getD1Database("DB");
await db.exec(
  "CREATE TABLE private_counters (owner TEXT PRIMARY KEY, value INTEGER NOT NULL); INSERT INTO private_counters VALUES ('alice', 0), ('bob', 0);",
);
if (ui)
  await db.exec(
    "CREATE TABLE ui_sessions (token TEXT PRIMARY KEY, owner TEXT NOT NULL); CREATE TABLE ui_notes (owner TEXT PRIMARY KEY, value INTEGER NOT NULL, writes INTEGER NOT NULL); INSERT INTO ui_notes VALUES ('alice',0,0);",
  );
const reports = [];
const server = createServer(
  {
    key: await readFile(root + "key.pem"),
    cert: await readFile(root + "ca.pem"),
  },
  async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("access-control-allow-headers", "*");
      res.setHeader("access-control-allow-methods", "GET,POST,HEAD,OPTIONS");
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      if (ui && req.url.startsWith("/__ui_config")) {
        res.setHeader("content-type", "application/json");
        res.setHeader("cache-control", "no-store");
        res.end(await readFile(root + "ui-config.json"));
        return;
      }
      if (ui && req.url === "/__ui_report") {
        const report = JSON.parse(body.toString());
        report.database = await db
          .prepare("SELECT owner,value,writes FROM ui_notes ORDER BY owner")
          .all();
        reports.push(report);
        await writeFile(
          root + "ui-reports.json",
          JSON.stringify(reports, null, 2),
        );
        res.end("ok");
        return;
      }
      if (req.url === "/__report") {
        const report = JSON.parse(body.toString());
        report.database = await db
          .prepare("SELECT owner, value FROM private_counters ORDER BY owner")
          .all();
        reports.push(report);
        await writeFile(
          root + "reports.json",
          JSON.stringify(reports, null, 2),
        );
        res.end("ok");
        return;
      }
      const headers = { ...req.headers };
      delete headers.host;
      delete headers["transfer-encoding"];
      delete headers["content-length"];
      const response = await backend.dispatchFetch(
        "https://existing-worker.invalid" + req.url,
        {
          method: req.method,
          headers,
          body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
          redirect: "manual",
        },
      );
      const bytes = Buffer.from(await response.arrayBuffer());
      const responseHeaders = Object.fromEntries(response.headers);
      if (response.headers.getSetCookie().length)
        responseHeaders["set-cookie"] = response.headers.getSetCookie();
      delete responseHeaders["transfer-encoding"];
      delete responseHeaders["content-length"];
      res.writeHead(response.status, {
        ...responseHeaders,
        "content-length": bytes.length,
      });
      res.end(bytes);
    } catch (error) {
      res.writeHead(500);
      res.end(String(error));
    }
  },
);
await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
await writeFile(
  root + "server.json",
  JSON.stringify({ port: server.address().port, ca: root + "ca.pem" }),
);
console.log("D1 native HTTPS backend", server.address().port);
async function stop() {
  await new Promise((resolve) => server.close(resolve));
  await backend.dispose();
  process.exit();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
