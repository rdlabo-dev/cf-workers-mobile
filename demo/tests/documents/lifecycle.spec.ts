import { expect, test } from "@playwright/test";

test("Fetch-only migration releases current clients and preserves application registrations", async ({
  page,
}) => {
  await page.goto("/lifecycle.html");
  await page.waitForFunction(() => !!(window as any).documentLifecycle);
  const result = await page.evaluate(async () => {
    const api = (window as any).documentLifecycle;
    await navigator.serviceWorker.register("/application-sw.js", {
      scope: "/application/",
    });
    await api.registerDocumentWorker("https://worker.example");
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
    await api.enableDocumentWorker();
    Object.assign(window, { Capacitor: { getPlatform: () => "android" } });
    const app = api.workersCapacitor({
      baseURL: "https://worker.example/api",
      worker: { fetch: () => new Response("api") },
    });
    await app.ready;
    const response = await fetch("/after-dispose.html");
    const text = await response.text();
    const registrations = await navigator.serviceWorker.getRegistrations();
    await app.dispose();
    return {
      text,
      registrations: registrations.map((r) => r.active?.scriptURL),
      controlled: !!navigator.serviceWorker.controller,
    };
  });
  expect(result.controlled).toBe(true);
  expect(result.text).toContain("Native asset after disposal");
  expect(result.registrations).toHaveLength(1);
  expect(result.registrations[0]).toContain("/application-sw.js");
  await page.goto("/after-dispose.html");
  await expect(page.locator("h1")).toHaveText("Native asset after disposal");
});

test("document transport can start again after shutdown", async ({ page }) => {
  await page.goto("/lifecycle.html");
  await page.waitForFunction(() => !!(window as any).documentLifecycle);
  for (let i = 0; i < 2; i++) {
    await page.evaluate(async () => {
      (window as any).documentRegistration = await (
        window as any
      ).documentLifecycle.registerDocumentWorker("https://worker.example");
    });
    // Unregistering leaves the previous controller attached to this page.
    // Wait for the new registration to control it, as the runtime does.
    await page.waitForFunction(() => {
      const registration = (window as any)
        .documentRegistration as ServiceWorkerRegistration;
      return (
        registration?.active?.state === "activated" &&
        !registration.installing &&
        !registration.waiting &&
        navigator.serviceWorker.controller === registration.active
      );
    });
    await page.evaluate(async () => {
      const api = (window as any).documentLifecycle;
      await api.enableDocumentWorker();
      await api.stopDocumentWorker();
    });
  }
  await page.goto("/after-dispose.html");
  await expect(page.locator("h1")).toHaveText("Native asset after disposal");
});
