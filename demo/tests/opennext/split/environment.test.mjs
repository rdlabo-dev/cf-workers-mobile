import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { compileOpenNext } from "../../../../dist/tooling/opennext/index.js";

test(
  "computed Cloudflare binding access in generated application code remains remote",
  { timeout: 120000 },
  async () => {
    const app = fileURLToPath(new URL("../../../opennext/", import.meta.url));
    const standalone = join(app, ".next/standalone");
    const suffix = ".next/server/app/api/notes/route.js";
    const files = [
      join(app, suffix),
      ...(await readdir(standalone, { recursive: true }))
        .filter((name) => name.endsWith(suffix))
        .map((name) => join(standalone, name)),
    ];
    const originals = new Map();
    try {
      for (const file of files) {
        const original = await readFile(file, "utf8");
        assert.ok(
          original.includes("env.DB"),
          "Generated fixture changed its binding access",
        );
        originals.set(file, original);
        await writeFile(
          file,
          original.replaceAll("env.DB", "env[globalThis.__testBindingName]"),
        );
      }
      const compilation = await compileOpenNext(
        join(app, ".open-next/worker.js"),
        [{ method: "GET", path: "/api/notes" }],
        ["DB"],
      );
      assert.equal(compilation.mode, "worker");
      assert.match(compilation.reason, /Cloudflare environment/);
      assert.equal(compilation.local.includes("INSERT INTO"), false);
    } finally {
      for (const [file, original] of originals) await writeFile(file, original);
    }
  },
);

for (const [kind, dependency] of [
  [
    "context",
    'module.exports = globalThis[Symbol.for("__cloudflare-context__")].env[globalThis.bindingName];',
  ],
  [
    "builtin",
    'module.exports = require("cloudflare:workers").env[globalThis.bindingName];',
  ],
])
  test(
    `external package Cloudflare ${kind} access remains remote`,
    { timeout: 120000 },
    async () => {
      const { mkdir, rm } = await import("node:fs/promises");
      const app = fileURLToPath(new URL("../../../opennext/", import.meta.url));
      const suffix = ".next/server/app/api/message/route.js";
      const files = [
        join(app, suffix),
        ...(await readdir(join(app, ".next/standalone"), { recursive: true }))
          .filter((name) => name.endsWith(suffix))
          .map((name) => join(app, ".next/standalone", name)),
      ];
      const originals = new Map(
        await Promise.all(
          files.map(async (file) => [file, await readFile(file, "utf8")]),
        ),
      );
      const packageDir = join(
        app,
        "node_modules/capacitor-server-dependency-fixture",
      );
      try {
        await mkdir(packageDir, { recursive: true });
        await writeFile(
          join(packageDir, "package.json"),
          JSON.stringify({
            name: "capacitor-server-dependency-fixture",
            main: "index.js",
          }),
        );
        await writeFile(join(packageDir, "index.js"), dependency);
        for (const [file, original] of originals)
          await writeFile(
            file,
            'require("capacitor-server-dependency-fixture");\n' + original,
          );
        const result = await compileOpenNext(
          join(app, ".open-next/worker.js"),
          [{ method: "GET", path: "/api/message" }],
          ["DB"],
        );
        assert.equal(result.mode, "worker");
        assert.match(result.reason, /Cloudflare environment|could not isolate/);
        assert.equal(result.local.includes("bindingName"), false);
      } finally {
        for (const [file, original] of originals)
          await writeFile(file, original);
        await rm(packageDir, { recursive: true, force: true });
      }
    },
  );
