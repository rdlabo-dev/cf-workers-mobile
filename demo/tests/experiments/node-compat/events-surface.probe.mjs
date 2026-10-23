import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, webkit } from "@playwright/test";
import { workersCapacitorPlugin } from "../../../../dist/tooling/esbuild.js";
import { lowerAsync } from "../../../../dist/tooling/async.js";
import { expectedEvents } from "../../../../src/compat/events/observations.spec.mjs";

// Public imports and selected observations for the scoped WebView profile.
// Native acceptance and broader operation contracts have separate runners.
const root = fileURLToPath(new URL("../../../..", import.meta.url));
const expectedTypes = JSON.parse(
  await readFile(new URL("export-types.json", import.meta.url), "utf8"),
).modules.events;
const compiled = await build({
  absWorkingDir: root,
  stdin: {
    contents: `import * as events from 'node:events';
import { observeEvents } from './src/compat/events/observations.spec.mjs';
import { AsyncLocalStorage } from 'node:async_hooks';
export const surface = Object.fromEntries(Object.entries(events).map(([key, value]) => [key, typeof value]));
export const observe = () => observeEvents(events, AsyncLocalStorage);`,
    resolveDir: root,
  },
  bundle: true,
  platform: "browser",
  format: "esm",
  write: false,
  outfile: "demo/artifacts/node-inventory/events-surface.js",
  plugins: [
    workersCapacitorPlugin({
      execution: "local",
      worker: "demo/src/workers/hono/standard.ts",
    }),
  ],
});
for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
  test(`${engine}: public events matches selected pinned Workers observations`, async () => {
    const browser = await launcher.launch();
    try {
      const page = await browser.newPage();
      const result = await page.evaluate(async (source) => {
        const url = URL.createObjectURL(
          new Blob([source], { type: "text/javascript" }),
        );
        try {
          const api = await import(url);
          return { surface: api.surface, observations: await api.observe() };
        } finally {
          URL.revokeObjectURL(url);
        }
      }, compiled.outputFiles[0].text);
      assert.deepEqual(result.surface, expectedTypes);
      assert.deepEqual(result.observations, expectedEvents);
      const output = new URL(
        "../../../artifacts/node-inventory/",
        import.meta.url,
      );
      await mkdir(output, { recursive: true });
      await writeFile(
        new URL(`events-surface-${engine}.json`, output),
        JSON.stringify(
          { engine, status: "selected-observations-only", ...result },
          null,
          2,
        ) + "\n",
      );
    } finally {
      await browser.close();
    }
  });
}

// Ordinary build lowering must preserve the native intrinsic without exemptions.
const intrinsicSource = await readFile(
  new URL("../../../../src/compat/events/intrinsics.ts", import.meta.url),
  "utf8",
);
const loweredIntrinsic = await lowerAsync(
  intrinsicSource,
  "intrinsics.mjs",
  "js",
);
for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
  test(`${engine}: ordinary async lowering preserves native iterator intrinsic discovery`, async () => {
    const browser = await launcher.launch();
    try {
      const page = await browser.newPage();
      const observe = (source) =>
        page.evaluate(async (code) => {
          const url = URL.createObjectURL(
            new Blob([code], { type: "text/javascript" }),
          );
          try {
            const api = await import(url);
            return {
              type: typeof api.AsyncIteratorPrototype[Symbol.asyncIterator],
            };
          } catch (error) {
            return { error: error.name };
          } finally {
            URL.revokeObjectURL(url);
          }
        }, source);
      assert.deepEqual(await observe(intrinsicSource), { type: "function" });
      assert.deepEqual(await observe(loweredIntrinsic.code), {
        type: "function",
      });
    } finally {
      await browser.close();
    }
  });
}
