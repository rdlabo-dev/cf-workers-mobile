import { test } from "node:test";
import { assertNoSurfaceRegression } from "./surface-regressions.mjs";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, webkit } from "@playwright/test";
import { workersCapacitorPlugin } from "../../../../dist/esbuild.js";

// An exhaustive discovery report, not a behavioral acceptance test. Failed
// imports remain visible instead of silently disappearing from the inventory.
const baseline = JSON.parse(
  await readFile(new URL("exports.json", import.meta.url), "utf8"),
);
const root = fileURLToPath(new URL("../../../..", import.meta.url));
const artifacts = new URL(
  "../../../artifacts/node-inventory/",
  import.meta.url,
);
// Known gaps are explicit debt, never a supported-module allowlist. New gaps
// fail the audit; removing a gap is allowed and remains subject to behavioral
// acceptance before the module can be marked Complete.
const knownGaps = JSON.parse(
  await readFile(new URL("surface-gaps.json", import.meta.url), "utf8"),
);
const sources = new Map();
for (const name of Object.keys(baseline.modules)) {
  try {
    const result = await build({
      absWorkingDir: root,
      stdin: {
        contents: `import * as api from ${JSON.stringify("node:" + name)}; export default Object.fromEntries(Object.entries(api).map(([key, value]) => [key, typeof value]));`,
        resolveDir: root,
      },
      bundle: true,
      platform: "browser",
      format: "esm",
      write: false,
      outfile: "demo/artifacts/node-inventory/probe.js",
      logLevel: "silent",
      plugins: [
        workersCapacitorPlugin({ worker: "demo/src/workers/hono/standard.ts" }),
      ],
    });
    sources.set(name, { source: result.outputFiles[0].text });
  } catch (error) {
    sources.set(name, {
      buildError: error.errors?.map((item) => item.text) ?? [error.message],
    });
  }
}
for (const [engine, browserType] of Object.entries({ chromium, webkit })) {
  test(`${engine}: audit all pinned builtin imports through the public esbuild plugin`, async () => {
    const browser = await browserType.launch();
    const modules = {};
    try {
      for (const [name, compiled] of sources) {
        if (compiled.buildError) {
          modules[name] = compiled;
          continue;
        }
        // Each module gets a fresh realm: import-time side effects cannot make
        // a later module appear supported or mask its initialization failure.
        const page = await browser.newPage();
        try {
          modules[name] = await page.evaluate(
            async ({ source, expected }) => {
              const url = URL.createObjectURL(
                new Blob([source], { type: "text/javascript" }),
              );
              try {
                const { default: surface } = await import(url);
                const names = Object.keys(surface).sort();
                return {
                  surface,
                  missing: expected.filter((name) => !names.includes(name)),
                  extra: names.filter((name) => !expected.includes(name)),
                };
              } catch (error) {
                return {
                  evaluationError: { name: error.name, message: error.message },
                };
              } finally {
                URL.revokeObjectURL(url);
              }
            },
            { source: compiled.source, expected: baseline.modules[name] },
          );
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
    assert.deepEqual(
      Object.keys(modules).sort(),
      Object.keys(baseline.modules).sort(),
    );
    await mkdir(artifacts, { recursive: true });
    await writeFile(
      new URL(`${engine}-surface.json`, artifacts),
      JSON.stringify({ profile: baseline.profile, modules }, null, 2) + "\n",
    );
    const gaps = Object.entries(modules).filter(
      ([, result]) =>
        result.buildError ||
        result.evaluationError ||
        result.missing?.length ||
        result.extra?.length,
    );
    for (const [name, result] of gaps) {
      assertNoSurfaceRegression(
        name,
        result,
        knownGaps[engine][name] ?? knownGaps.common[name],
      );
    }
    console.log(
      `${engine}: ${gaps.length}/${Object.keys(modules).length} modules have export/import gaps (behavior not certified)`,
    );
    for (const [name, result] of gaps)
      console.log(
        `${name}: ${JSON.stringify(result.buildError ?? result.evaluationError ?? { missing: result.missing, extra: result.extra })}`,
      );
  });
}
