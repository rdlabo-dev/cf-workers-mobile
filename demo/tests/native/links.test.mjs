import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { linksScript } from "../../../dist/browser/documents/links-source.js";

test("Worker absolute links stay local without taking over other click behavior", async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    await context.addInitScript({
      content: `globalThis.__workersCapacitorDocuments = {baseURL:"https://worker.example"};\n${linksScript}`,
    });
    const html = `<a id="local" href="https://worker.example/article?q=1#part">Article</a>
      <a id="external" href="https://outside.example/article">Outside</a>
      <a id="blank" target="_blank" href="https://worker.example/article">New tab</a>
      <a id="download" download href="https://worker.example/file">Download</a>
      <a id="handled" href="https://worker.example/article" onclick="event.preventDefault()">Handled</a>
      <a id="credentials" href="https://user:password@worker.example/article">Credentials</a>
      <iframe src="/frame"></iframe>`;
    await context.route("**/*", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: html.replace(
          '<iframe src="/frame"></iframe>',
          route.request().url().endsWith("/frame")
            ? ""
            : '<iframe src="/frame"></iframe>',
        ),
      }),
    );
    const page = await context.newPage();
    await page.goto("https://app.example/");
    await page.locator("#local").click();
    await page.waitForURL("https://app.example/article?q=1#part");
    await page.evaluate(() => {
      document.addEventListener("click", (event) => {
        if (event.target.id === "delegated") event.preventDefault();
      });
      const link = document.createElement("a");
      link.id = "delegated";
      link.href = "https://worker.example/delegated";
      document.body.append(link);
    });
    for (const id of [
      "delegated",
      "external",
      "blank",
      "download",
      "credentials",
      "handled",
    ]) {
      const preventedByAdapter = await page.evaluate((id) => {
        let observed;
        const stop = (event) => {
          observed = event.defaultPrevented;
          event.preventDefault();
        };
        window.addEventListener("click", stop, { once: true });
        document.getElementById(id).click();
        return observed;
      }, id);
      assert.equal(
        preventedByAdapter,
        ["handled", "delegated"].includes(id),
        id,
      );
    }
    for (const modifier of ["ctrlKey", "metaKey", "shiftKey", "altKey"]) {
      assert.equal(
        await page.evaluate((modifier) => {
          let observed;
          window.addEventListener(
            "click",
            (event) => {
              observed = event.defaultPrevented;
              event.preventDefault();
            },
            { once: true },
          );
          document.getElementById("local").dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              [modifier]: true,
            }),
          );
          return observed;
        }, modifier),
        false,
      );
    }
    await page.waitForTimeout(100);
    assert.equal(page.url(), "https://app.example/article?q=1#part");
    const frame = page.frames().find((frame) => frame.url().endsWith("/frame"));
    assert.ok(frame);
    assert.equal(
      await frame.evaluate(() => {
        let observed;
        window.addEventListener(
          "click",
          (event) => {
            observed = event.defaultPrevented;
            event.preventDefault();
          },
          { once: true },
        );
        document.getElementById("local").click();
        return observed;
      }),
      false,
    );
  } finally {
    await browser.close();
  }
});
