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
        expect(
          report.node.direct
            .flatMap((result) => result.cases)
            .filter((c) => c.status !== "passed"),
        ).toEqual([]);
        expect(
          report.node.direct.flatMap((result) =>
            result.cases.map((c) => c.status),
          ),
        ).toEqual(Array(67).fill("passed"));
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
      const statuses = (
        report.contracts as {
          cases: { id: string; status: string }[];
        }[]
      ).flatMap((result) => result.cases.map((c) => c.status));
      expect(
        (report.contracts as { cases: { status: string }[] }[])
          .flatMap((r) => r.cases)
          .filter((c) => c.status !== "passed"),
      ).toEqual([]);
      expect(statuses).toEqual(Array(67).fill("passed"));
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
