import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { preview } from "vite";
import { chromium, webkit } from "@playwright/test";
import { assertInitialRendering } from "../../rendering/assertions.ts";
for (const bundler of ["vite", "esbuild"])
  test(
    `${bundler}: split OpenNext renders public pages without contacting the remote Worker or bundling its SQL/keys`,
    { timeout: 180000 },
    async () => {
      const output = new URL(
        `../../../artifacts/opennext-split${bundler === "esbuild" ? "-esbuild" : ""}/www/`,
        import.meta.url,
      );
      const report = JSON.parse(
        await readFile(
          new URL("workers-capacitor-server.json", output),
          "utf8",
        ),
      );
      assert.equal(report.mode, "routes");
      assert.equal(
        report.routes.find((route) => route.path === "/account").remote,
        true,
      );
      const prerender = JSON.parse(
        await readFile(
          new URL(
            "../../../opennext/.next/prerender-manifest.json",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      assert.equal(
        prerender.routes["/"],
        undefined,
        "The local page must exercise SSR, not prerendered HTML",
      );
      const previewKeys = Object.values(prerender.preview);
      const actions = JSON.parse(
        await readFile(
          new URL(
            "../../../opennext/.next/server/server-reference-manifest.json",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      for (const name of await readdir(output, { recursive: true })) {
        if (!/\.(js|map)$/.test(name)) continue;
        const code = await readFile(new URL(name, output), "utf8");
        for (const secret of [
          ...previewKeys,
          actions.encryptionKey,
          "INSERT INTO sessions",
          "SELECT owner FROM sessions",
          "__Host-demo_csrf",
        ])
          assert.equal(
            code.includes(secret),
            false,
            `Server data leaked in ${name}`,
          );
        // VFS embeds manifests as base64, so plain-text scanning alone is insufficient.
        for (const value of code.matchAll(
          /(?:"base64"|base64)\s*:\s*"([A-Za-z0-9+/=]+)"/g,
        )) {
          const decoded = Buffer.from(value[1], "base64").toString();
          for (const secret of [...previewKeys, actions.encryptionKey])
            assert.equal(
              decoded.includes(secret),
              false,
              `Server key in VFS: ${name}`,
            );
        }
      }
      const server = await preview({
        configFile: false,
        root: fileURLToPath(new URL("../../../", import.meta.url)),
        build: { outDir: fileURLToPath(output) },
        preview: { host: "127.0.0.1", port: 0 },
      });
      try {
        for (const engine of [chromium, webkit]) {
          const browser = await engine.launch();
          try {
            const page = await browser.newPage();
            const remote = [];
            await page.route("https://unreachable.invalid/**", (route) => {
              remote.push(route.request().url());
              return route.abort();
            });
            page.on("pageerror", (error) => console.error(error));
            await page.goto(server.resolvedUrls.local[0]);
            const result = await page.evaluate(async () => {
              await window.runtime.ready;
              const response = await fetch("https://worker.invalid/");
              return { status: response.status, html: await response.text() };
            });
            assert.equal(result.status, 200, result.html);
            await assertInitialRendering(browser, result.html, {
              initial: { h1: "OpenNext in Capacitor", "#counter": "Count: 0" },
              clientOnly: ["#client-only"],
            });
            assert.deepEqual(
              remote,
              [],
              "Public SSR must not contact the backend",
            );
            const message = await page.evaluate(async () =>
              (await fetch("https://worker.invalid/api/message")).json(),
            );
            assert.equal(message.message, "Next.js API ready");
            assert.deepEqual(remote, []);
            for (const [path, init] of [
              ["/account", {}],
              ["/", { method: "POST", body: "action" }],
              ["/", { headers: { rsc: "1" } }],
              ["/", { headers: { "next-router-segment-prefetch": "/" } }],
              ["/", { headers: { authorization: "Bearer test" } }],
            ]) {
              const before = remote.length;
              await page.evaluate(
                async ({ path, init }) => {
                  try {
                    await fetch("https://worker.invalid" + path, init);
                  } catch {}
                },
                { path, init },
              );
              assert.ok(
                remote.length > before,
                "Cloud-dependent requests must select remote execution",
              );
              assert.equal(new URL(remote.at(-1)).pathname, path);
            }
          } finally {
            await browser.close();
          }
        }
      } finally {
        await new Promise((resolve) => server.httpServer.close(resolve));
      }
    },
  );
