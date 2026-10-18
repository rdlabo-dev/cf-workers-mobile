import { expect, type Browser } from "@playwright/test";

// Inspect only parsed document elements, never script/RSC payload strings.
// This proves initial HTML, not whether it was prerendered or request-rendered.
// Expected regions are application-specific; this does not infer route safety.
export async function assertInitialRendering(
  browser: Browser,
  body: string,
  expected: { initial: Record<string, string>; clientOnly: string[] },
) {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.route("**/*", (route) => route.abort());
    await page.setContent(body, { waitUntil: "domcontentloaded" });
    for (const [selector, text] of Object.entries(expected.initial)) {
      await expect(page.locator(selector)).toHaveText(text);
      await expect(page.locator(selector)).toBeVisible();
    }
    for (const selector of expected.clientOnly)
      await expect(page.locator(selector)).toHaveCount(0);
  } finally {
    await context.close();
  }
}
