import expectedCases from "../validation/expected-cases.json" with { type: "json" };
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => console.error("Fallback page error:", error));
  await page.addInitScript(() => {
    const removeByteStreams = `delete globalThis.ReadableByteStreamController; delete globalThis.ReadableStreamBYOBReader; delete globalThis.ReadableStreamBYOBRequest;`;
    const realm = globalThis as unknown as Record<string, unknown>;
    delete realm.ReadableByteStreamController;
    delete realm.ReadableStreamBYOBReader;
    delete realm.ReadableStreamBYOBRequest;
    const NativeWorker = Worker,
      NativeBlob = Blob,
      NativeURL = URL;
    const bootstraps = new WeakMap<Worker, string>();
    globalThis.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        const target = new NativeURL(String(url), location.href).href;
        const bootstrap = NativeURL.createObjectURL(
          new NativeBlob(
            [`${removeByteStreams}\nawait import(${JSON.stringify(target)});`],
            { type: "text/javascript" },
          ),
        );
        super(bootstrap, { ...options, type: "module" });
        bootstraps.set(this, bootstrap);
      }
      override terminate() {
        super.terminate();
        NativeURL.revokeObjectURL(bootstraps.get(this)!);
      }
    };
  });
});

test("Vite development shares fallback constructors across direct and isolated modules", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.runFeatures === "function");
  const reports = await page.evaluate(() => window.runFeatures());
  expect(reports.flatMap((report) => report.errors)).toEqual([]);
  const expected = Object.entries(expectedCases).flatMap(([feature, cases]) =>
    (feature.startsWith("node.") || feature === "fetch.basic"
      ? ["direct", "isolated"]
      : ["webview"]
    ).map((environment) => [environment, feature, cases]),
  );
  expect(
    reports
      .map((r) => [r.environment, r.feature, r.cases.map((c) => c.id)])
      .sort(),
  ).toEqual(expected.sort());
  expect(
    reports
      .flatMap((report) => report.cases)
      .filter((c) => c.status !== "passed"),
  ).toEqual([]);
});

for (const framework of ["hono", "express"] as const) {
  test(`${framework} runs offline with fallback stream constructors`, async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page.waitForFunction(
      () => typeof window.startExperiment === "function",
    );
    await page.evaluate(async (framework) => {
      window.experiment = window.startExperiment(
        location.origin,
        "https://worker.invalid/api",
        framework,
      );
      await window.experiment.ready;
    }, framework);
    await context.setOffline(true);
    try {
      const results = await page.evaluate(
        (framework) => window.runFrameworkContract(framework),
        framework,
      );
      expect(results).toHaveLength(11);
      expect(results.filter((result) => !result.ok)).toEqual([]);
    } finally {
      await page.evaluate(() => window.experiment.dispose());
    }
  });
}
