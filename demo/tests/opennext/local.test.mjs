import { test } from "node:test";
import assert from "node:assert/strict";
import { preview } from "vite";
import { chromium, webkit } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { assertInitialRendering } from "../rendering/assertions.ts";
for (const bundler of ["vite", "esbuild"])
  test(
    `${bundler}: public OpenNext pages execute locally without a backend`,
    { timeout: 120000 },
    async () => {
      const server = await preview({
        configFile: false,
        root: fileURLToPath(new URL("../../", import.meta.url)),
        build: {
          outDir: `artifacts/opennext-${bundler === "vite" ? "local" : "esbuild"}`,
        },
        preview: { host: "127.0.0.1", port: 0 },
      });
      try {
        for (const engine of [chromium, webkit]) {
          const browser = await engine.launch();
          try {
            const page = await browser.newPage();
            page.on("pageerror", (error) => console.error(error));
            page.on("console", (msg) => {
              if (msg.type() === "error") console.error(msg.text());
            });
            await page.route("https://worker.invalid/**", (route) =>
              route.abort(),
            );
            await page.goto(server.resolvedUrls.local[0]);
            const result = await page.evaluate(async () => {
              await window.runtime.ready;
              const response = await fetch("https://worker.invalid/");
              return { status: response.status, body: await response.text() };
            });
            assert.equal(result.status, 200, result.body);
            await assertInitialRendering(browser, result.body, {
              initial: {
                h1: "OpenNext in Capacitor",
                "#server-rendered": "Rendered by Next.js",
                "#counter": "Count: 0",
              },
              clientOnly: ["#client-only"],
            });
            for (const value of [crypto.randomUUID(), crypto.randomUUID()]) {
              const details = await page.evaluate(async (value) => {
                const response = await fetch(
                  `https://worker.invalid/details?q=${value}`,
                );
                return {
                  status: response.status,
                  middleware: response.headers.get("x-sample-middleware"),
                  body: await response.text(),
                };
              }, value);
              assert.equal(details.status, 200);
              assert.equal(details.middleware, "ran");
              await assertInitialRendering(browser, details.body, {
                initial: { h1: "Details", "#query": value },
                clientOnly: [],
              });
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
