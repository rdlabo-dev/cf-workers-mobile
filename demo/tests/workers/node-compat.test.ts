import { builtinModules } from "node:module";
import { afterAll, beforeAll, expect, it } from "vitest";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  assertContract,
  type ContractResult,
} from "@rdlabo/capacitor-workers/testing";

let harness: Miniflare;
beforeAll(async () => {
  // Wrangler's builtin resolver omits mandatory-prefix node:test. Keep all
  // node:* imports external so this contract exercises real workerd builtins.
  const bundle = await build({
    entryPoints: ["tests/fixtures/workers/compatibility/node.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    plugins: [
      {
        name: "workerd-builtins",
        setup(builder) {
          const names = new Set(
            builtinModules.filter((name) => !name.startsWith("node:")),
          );
          builder.onResolve({ filter: /^[a-z_]/ }, ({ path }) =>
            names.has(path)
              ? { path: `node:${path}`, external: true }
              : undefined,
          );
        },
      },
    ],
    external: ["node:*", "cloudflare:*"],
  });
  harness = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: "2026-10-17",
      script: bundle.outputFiles[0].text,
    }),
  );
  await harness.ready;
});
afterAll(async () => {
  await harness?.dispose();
});

it("runs the node module contracts against real workerd", async () => {
  const reports = (await (
    await harness.dispatchFetch("https://node-compat.invalid/")
  ).json()) as ContractResult[];
  expect(reports.map((report) => report.feature)).toEqual([
    "node.path",
    "node.querystring",
    "node.string_decoder",
    "node.http",
    "node.net",
    "node.buffer",
    "node.timers",
    "node.url",
    "node.os",
    "node.tty",
    "node.wasi",
    "node.punycode",
    "node.constants",
    "node.v8",
    "node.http2",
    "node.vm",
    "node.child_process",
    "node.cluster",
    "node.dgram",
    "node.inspector",
    "node.domain",
    "node.readline",
    "node.repl",
    "node.sqlite",
    "node.test",
    "node.stream/consumers",
    "node.dns",
    "node.https",
    "node.worker_threads",
    "node._http_agent",
    "node._http_client",
    "node._http_incoming",

    "node.async-hooks",
    "node.stream-web",
    "node.util",
  ]);
  expect(reports.map((report) => report.cases.length)).toEqual([
    14, 11, 15, 18, 9, 24, 30, 19, 6, 5, 8, 5, 3, 11, 5, 10, 5, 5, 6, 8, 6, 8,
    6, 4, 14, 10, 14, 10, 12, 2, 2, 2, 15, 1, 10,
  ]);
  for (const report of reports) assertContract(report);
  expect(
    reports
      .flatMap((report) => report.cases)
      .every(
        (test) => test.status === "passed" || test.status === "unsupported",
      ),
  ).toBe(true);
});
