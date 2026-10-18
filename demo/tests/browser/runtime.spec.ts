import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

test.use({ baseURL: "http://127.0.0.1:4188" });

test("Fetch adapter preserves browser Request semantics", async ({ page }) => {
  await page.route("**/runtime-under-test/**", async (route) => {
    const file = new URL(route.request().url()).pathname.slice(
      "/runtime-under-test/".length,
    );
    const source = await readFile(
      new URL("../../../dist/" + file, import.meta.url),
      "utf8",
    );
    await route.fulfill({ contentType: "text/javascript", body: source });
  });
  await page.goto("/");
  await page.waitForFunction(() => window.pocDone);
  const result = await page.evaluate(async () => {
    const moduleURL = "/runtime-under-test/index.js";
    const { capacitorWorkers } = await import(moduleURL);
    const base = document.createElement("base");
    base.href = "/api/";
    document.head.append(base);
    let calls = 0;
    const runtime = capacitorWorkers({
      baseURL: "https://worker.invalid/api",
      worker: {
        async fetch(request: Request) {
          calls++;
          if (request.method === "HEAD")
            return new Response("discard", { headers: { "x-head": "yes" } });
          if (request.method === "POST") {
            const data = await request.formData();
            return Response.json({
              value: data.get("value"),
              url: request.url,
            });
          }
          return new Response(request.url);
        },
      },
    });
    try {
      const form = new FormData();
      form.set("value", "日本語 🍷");
      const response = await fetch("form", { method: "POST", body: form });
      const post = await response.json();
      const head = await fetch("head", { method: "HEAD" });
      const before = calls;
      const controller = new AbortController();
      const pending = fetch("cancel", { signal: controller.signal });
      controller.abort();
      const abort = await pending.then(
        () => "unexpected",
        (error) => error.name,
      );
      return {
        post,
        headBody: await head.text(),
        headHeader: head.headers.get("x-head"),
        abort,
        cancelledCalls: calls - before,
      };
    } finally {
      runtime.dispose();
      base.remove();
    }
  });
  expect(result).toEqual({
    post: { value: "日本語 🍷", url: "https://worker.invalid/api/form" },
    headBody: "",
    headHeader: "yes",
    abort: "AbortError",
    cancelledCalls: 0,
  });
});
