import expectedCases from "../validation/expected-cases.json" with { type: "json" };
import { expect, test } from "@playwright/test";
test("one feature standard covers direct/isolated fetch, state and engine capability", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.runFeatures === "function");
  const reports = await page.evaluate(() => window.runFeatures());
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
  const cases = reports.flatMap((report) => report.cases);
  expect(reports.flatMap((report) => report.errors)).toEqual([]);
  expect(cases.filter((result) => result.status !== "passed")).toEqual([]);
});

test("KV survives a WebView document reload and remains namespace-isolated", async ({
  page,
}) => {
  await page.goto("/");
  const namespace = `reload-${crypto.randomUUID()}`;
  const request = (method: string, body?: string, name = namespace) =>
    page.evaluate(
      async ({ name, method, body }) => {
        const win = window as unknown as {
          kvRequest: (
            name: string,
            method: string,
            body?: string,
          ) => Promise<{ status: number; body: string }>;
        };
        return win.kvRequest(name, method, body);
      },
      { name, method, body },
    );
  try {
    expect((await request("PUT", "saved 🍷")).status).toBe(204);
    await page.reload();
    expect(await request("GET")).toEqual({ status: 200, body: "saved 🍷" });
    expect((await request("GET", undefined, namespace + "other")).status).toBe(
      404,
    );
    expect((await request("DELETE")).status).toBe(204);
    await page.reload();
    expect((await request("GET")).status).toBe(404);
  } finally {
    await request("DELETE");
  }
});
