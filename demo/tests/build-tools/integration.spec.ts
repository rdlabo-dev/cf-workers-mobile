import expectedCases from "../validation/expected-cases.json" with { type: "json" };
const expectedNodeCases = Object.entries(expectedCases)
  .filter(([feature]) => feature.startsWith("node."))
  .sort();
import { test, expect } from "@playwright/test";
for (const build of [
  "vite-hono",
  "vite-express",
  "esbuild-hono",
  "esbuild-express",
  "raw",
]) {
  for (const prefer of ["worker", "direct"] as const) {
    test(`${build}: ${prefer} runs the shared contract`, async ({ page }) => {
      await page.goto(`/${build}/`);
      await page.waitForFunction(
        () => typeof window.runBuildTool === "function",
      );
      const report = await page.evaluate(
        (prefer) => window.runBuildTool(prefer),
        prefer,
      );
      expect(report.execution).toBe(prefer);
      expect(report.cases).toHaveLength(build === "raw" ? 4 : 9);
      expect(report.cases.every((result) => result.ok)).toBe(true);
      if (build !== "raw") {
        // node: and bare specifiers resolve to one profile per bundler.
        expect(report.resolved).toEqual(Array(11).fill(true));
      }
    });
  }
}
test("vite static explicit Worker import is prepared before evaluation", async ({
  page,
}) => {
  await page.goto("/vite-static-node/static-node.html");
  await page.waitForFunction(
    () => typeof window.runStaticNodeBuild === "function",
  );
  expect(await page.evaluate(() => window.runStaticNodeBuild())).toEqual({
    evaluated: Array(5).fill(true),
  });
});

// The node contract worker is the configured entry of these builds, so
// prefer=worker runs the contracts inside the bundled Dedicated Worker and
// prefer=direct runs them in-page; no Worker-entry transform is needed.
for (const build of ["vite-node", "esbuild-node"]) {
  for (const prefer of ["worker", "direct"] as const) {
    test(`${build}: ${prefer} runs the node module contracts`, async ({
      page,
    }) => {
      await page.goto(`/${build}/${build === "vite-node" ? "node.html" : ""}`);
      await page.waitForFunction(
        () => typeof window.runNodeBuild === "function",
      );
      const report = await page.evaluate(
        (prefer) => window.runNodeBuild(prefer),
        prefer,
      );
      expect(report.execution).toBe(prefer);
      expect(report.mixedModule).toBe(true);
      expect(report.commonJsStreams).toEqual(Array(7).fill(true));
      expect(report.commonJsTimers).toEqual(Array(8).fill(true));
      expect(report.commonJsAssertions).toEqual({
        callable: true,
        sameDefault: true,
      });
      const cases = (
        report.contracts as {
          feature: string;
          errors: string[];
          cases: { id: string; status: string }[];
        }[]
      ).flatMap((result) => result.cases);
      const contracts = report.contracts as {
        feature: string;
        errors: string[];
        cases: { id: string }[];
      }[];
      expect(
        contracts.map((r) => [r.feature, r.cases.map((c) => c.id)]).sort(),
      ).toEqual(expectedNodeCases);
      expect(contracts.flatMap((r) => r.errors)).toEqual([]);
      expect(
        cases.filter(
          (c) => c.status === "failed" || c.status === "unavailable",
        ),
      ).toEqual([]);
      expect(
        cases.filter((c) => c.status === "unsupported").map((c) => c.id),
      ).toEqual([]);
      expect(report.globals.unqualified).toEqual([true, true]);
      expect(report.globals.qualified).toEqual([true, true, true]);
      expect(report.globals.computed).toEqual([true, true, true]);
      expect(report.globals.dynamic).toEqual(Array(5).fill(true));
      expect(report.globals.processEnv).toEqual({});
      expect(report.webGlobals).toEqual(
        Object.fromEntries(
          ["entry", "static", "dynamic"].map((name) => [
            name,
            [[`${name}=1`], { marker: name }],
          ]),
        ),
      );
      expect(report.cleanup).toBe(true);
    });
  }
}
