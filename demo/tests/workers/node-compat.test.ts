import expectedCases from "../validation/expected-cases.json" with { type: "json" };
import { builtinModules } from "node:module";
import { afterAll, beforeAll, expect, it } from "vitest";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  assertContract,
  type ContractResult,
} from "@rdlabo/workers-capacitor/shared/contracts/testing";

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
  const expected = Object.entries(expectedCases).filter(
    ([feature]) =>
      feature.startsWith("node.") &&
      !["node.fs", "node.module"].includes(feature),
  );
  expect(
    reports.map((r) => [r.feature, r.cases.map((c) => c.id)]).sort(),
  ).toEqual(expected.sort());
  for (const report of reports) assertContract(report);
  expect(
    reports
      .flatMap((report) => report.cases)
      .every((test) => test.status === "passed"),
  ).toBe(true);
});
