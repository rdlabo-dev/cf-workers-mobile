import { expect, test } from "@playwright/test";
test("one feature standard covers direct/isolated fetch, state and engine capability", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.runFeatures === "function");
  const reports = await page.evaluate(() => window.runFeatures());
  expect(reports.map((report) => report.cases.length)).toEqual([
    4, 4, 18, 2, 14, 11, 15, 18, 9, 24, 30, 19, 6, 5, 8, 5, 3, 11, 5, 10, 5, 5,
    6, 8, 6, 8, 6, 4, 14, 10, 15, 14, 6, 14, 10, 12, 2, 2, 2, 15, 8, 2, 1, 28,
    14, 11, 15, 18, 9, 24, 30, 19, 6, 5, 8, 5, 3, 11, 5, 10, 5, 5, 6, 8, 6, 8,
    6, 4, 14, 10, 15, 14, 6, 14, 10, 12, 2, 2, 2, 15, 8, 2, 1, 28,
  ]);
  const cases = reports.flatMap((report) => report.cases);
  expect(reports.flatMap((report) => report.errors)).toEqual([]);
  expect(
    cases.filter(
      (result) => result.status === "failed" || result.status === "unavailable",
    ),
  ).toEqual([]);
  expect(
    reports
      .filter((report) => report.feature === "node.async-hooks")
      .map((report) =>
        report.cases
          .filter((result) => result.status === "unsupported")
          .map((result) => result.id),
      ),
  ).toEqual([
    ["settleRestore", "nestedAsyncRestore", "concurrentIsolation"],
    ["settleRestore", "nestedAsyncRestore", "concurrentIsolation"],
  ]);
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
