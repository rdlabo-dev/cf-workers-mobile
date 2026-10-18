import { test, expect } from "@playwright/test";
import { assertInitialRendering } from "../rendering/assertions";

for (const framework of ["hono", "express"]) {
  test(`${framework}: initial HTML, request rendering and client-only API content stay distinct`, async ({
    browser,
    context,
    page,
  }) => {
    const host = await context.newPage();
    await host.goto(`/runtime.html?framework=${framework}`);
    // Fetch through the real local runtime before the visible page runs scripts.
    const result = await host.evaluate(async () => {
      const response = await fetch("https://worker.invalid/pages/home");
      return { status: response.status, body: await response.text() };
    });
    expect(result.status).toBe(200);
    await assertInitialRendering(browser, result.body, {
      initial: {
        h1: framework === "hono" ? "Hello from Hono TSX" : "Hello from Express",
        "#api": "Waiting",
      },
      clientOnly: ["#client-only"],
    });
    // A fresh input must reach the rendered document, not just scripts/data.
    for (const value of [crypto.randomUUID(), crypto.randomUUID()]) {
      const body = await host.evaluate(async (value) => {
        const response = await fetch(
          `https://worker.invalid/pages/search?q=${value}`,
        );
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        return response.text();
      }, value);
      await assertInitialRendering(browser, body, {
        initial: { "#query": value },
        clientOnly: [],
      });
    }
    await page.goto("/");
    const message = `${framework === "hono" ? "Hono" : "Express"} API ready`;
    await expect(page.locator("#api")).toHaveText(message);
    await expect(page.locator("#client-only")).toHaveText(message);
  });
}

test("serialized markup and comments are not SSR content", async ({
  browser,
}) => {
  const body = `<!doctype html><html><head></head><body>
    <script type="application/json">{"html":"<p id='client-only'>Data</p>"}</script>
    <!-- <p id="client-only">Data</p> -->
    <script>document.body.innerHTML += '<p id="client-only">Data</p>';</script></body></html>`;
  await assertInitialRendering(browser, body, {
    initial: {},
    clientOnly: ["#client-only"],
  });
  const page = await browser.newPage();
  try {
    await page.setContent(body);
    await expect(page.locator("#client-only")).toHaveText("Data");
  } finally {
    await page.close();
  }
});
