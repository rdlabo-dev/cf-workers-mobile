import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:https";
import { createServer as reservePort } from "node:net";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { once } from "node:events";

export const app = fileURLToPath(
  new URL(
    "../../../artifacts/upstream/opennext/e2e/app-router/",
    import.meta.url,
  ),
);
export async function startBackend() {
  const reservation = reservePort();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(
    process.execPath,
    [
      "node_modules/@opennextjs/cloudflare/dist/cli/index.js",
      "preview",
      "--port",
      String(port),
      "--ip",
      "127.0.0.1",
    ],
    {
      detached: true,
      cwd: app,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    },
  );
  let log = "";
  const collect = (chunk) => {
    log = (log + chunk).slice(-20000);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  const certDir = await mkdtemp(join(tmpdir(), "upstream-opennext-"));
  let server;
  const reports = [];
  let pendingSSR = 0;
  const requests = [];
  async function close() {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      process.kill(-child.pid, "SIGTERM");
      const force = setTimeout(() => {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {}
      }, 3000);
      await exited;
      clearTimeout(force);
    }
    await writeFile(join(app, `../../preview-${port}.log`), log);
    await rm(certDir, { recursive: true, force: true });
  }
  try {
    const deadline = Date.now() + 60000;
    while (!log.includes(`Ready on http://127.0.0.1:${port}`)) {
      if (child.exitCode !== null || Date.now() > deadline)
        throw new Error(log);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
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
        "/CN=Upstream acceptance",
        "-addext",
        "subjectAltName=DNS:localhost,IP:127.0.0.1",
        "-addext",
        "basicConstraints=critical,CA:TRUE",
      ],
      { cwd: certDir, stdio: "pipe" },
    );
    server = createServer(
      {
        key: await readFile(join(certDir, "key.pem")),
        cert: await readFile(join(certDir, "ca.pem")),
      },
      async (req, res) => {
        try {
          if (req.url === "/__acceptance/driver.js") {
            res.setHeader("content-type", "text/javascript");
            res.end(await readFile(new URL("driver.js", import.meta.url)));
            return;
          }
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          if (req.url === "/__acceptance/report") {
            reports.push({
              ...JSON.parse(Buffer.concat(chunks).toString()),
              duringSSR: pendingSSR > 0,
            });
            res.end("ok");
            return;
          }
          requests.push({
            method: req.method,
            path: req.url,
            action: req.headers["next-action"],
          });
          if (req.url === "/ssr") {
            pendingSSR++;
            res.once("close", () => pendingSSR--);
          }
          const headers = {
            ...req.headers,
            "x-forwarded-host": req.headers.host,
            "x-forwarded-proto": "https",
            "accept-encoding": "identity",
          };
          // Wrangler rewrites Host/X-Forwarded-Host to its local listener. Translate
          // only this test proxy's own Origin; preserve foreign origins so Next's
          // Server Action CSRF check still rejects them.
          if (headers.origin === `https://${req.headers.host}`)
            headers.origin = `http://127.0.0.1:${port}`;
          delete headers["content-length"];
          delete headers["transfer-encoding"];
          const response = await fetch(`http://127.0.0.1:${port}${req.url}`, {
            method: req.method,
            headers,
            body: ["GET", "HEAD"].includes(req.method)
              ? undefined
              : Buffer.concat(chunks),
            redirect: "manual",
          });
          const out = Object.fromEntries(response.headers);
          delete out["content-length"];
          delete out["content-encoding"];
          delete out["transfer-encoding"];
          if (response.headers.getSetCookie().length)
            out["set-cookie"] = response.headers.getSetCookie();
          res.writeHead(response.status, out);
          const html = response.headers
            .get("content-type")
            ?.includes("text/html");
          let inserted = !html;
          let prefix = Buffer.alloc(0);
          // Insert the observer without decoding or buffering the HTML stream.
          for await (const chunk of response.body ?? []) {
            if (inserted) {
              if (!res.write(chunk)) await once(res, "drain");
              continue;
            }
            prefix = Buffer.concat([prefix, chunk]);
            const head = prefix.indexOf("<head>");
            if (head >= 0) {
              res.write(prefix.subarray(0, head + 6));
              res.write('<script src="/__acceptance/driver.js"></script>');
              res.write(prefix.subarray(head + 6));
              inserted = true;
            } else if (prefix.length > 65536) {
              throw new Error("No HTML head for acceptance instrumentation");
            }
          }
          if (!inserted) res.write(prefix);
          res.end();
        } catch (error) {
          console.error(error);
          if (!res.headersSent) res.writeHead(500);
          res.end("Acceptance backend failed");
        }
      },
    );
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    return {
      url: new URL(`https://localhost:${server.address().port}`),
      ca: join(certDir, "ca.pem"),
      reports,
      requests,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
