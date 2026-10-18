import { build } from "vite";
import { fileURLToPath } from "node:url";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium, webkit, expect } from "@playwright/test";
import { startBackend } from "./backend.mjs";

test(
  "unchanged OpenNext app renders, hydrates, navigates and persists D1 sessions in workerd",
  { timeout: 180000 },
  async () => {
    const backend = await startBackend();
    try {
      await build({
        configFile: fileURLToPath(
          new URL("../../opennext/capacitor/vite.config.ts", import.meta.url),
        ),
        define: {
          "import.meta.env.VITE_WORKER_ORIGIN": JSON.stringify(
            backend.url.origin,
          ),
        },
      });
      const output = new URL("../../opennext/www/", import.meta.url);
      assert.equal(
        JSON.parse(
          await readFile(
            new URL("workers-capacitor-server.json", output),
            "utf8",
          ),
        ).mode,
        "worker",
      );
      for (const path of await readdir(output, { recursive: true })) {
        if (!path.endsWith(".js")) continue;
        const code = await readFile(new URL(path, output), "utf8");
        assert.equal(
          code.includes("INSERT INTO sessions"),
          false,
          "Server SQL must not be shipped to Capacitor",
        );
        assert.equal(
          code.includes("server-functions/default/"),
          false,
          "Remote builds must not embed OpenNext server files",
        );
      }
      const response = await backend.fetch("/details");
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-sample-middleware"), "ran");
      for (const engine of [chromium, webkit]) {
        const browser = await engine.launch();
        try {
          const context = await browser.newContext({ ignoreHTTPSErrors: true });
          const page = await context.newPage();
          await page.goto(backend.url.href);
          await expect(page.locator("h1")).toHaveText("OpenNext in Capacitor");
          await page.locator("#counter").click();
          await expect(page.locator("#counter")).toHaveText("Count: 1");
          assert.equal(
            await page
              .locator("main")
              .evaluate((e) => getComputedStyle(e).maxWidth),
            "640px",
          );
          assert.equal(
            await page
              .locator("img")
              .evaluate((e) => e.complete && e.naturalWidth > 0),
            true,
          );
          await page
            .getByRole("link", { name: "Details", exact: true })
            .click();
          await expect(page.locator("h1")).toHaveText("Details");
          await page.goBack();
          await expect(page.locator("h1")).toHaveText("OpenNext in Capacitor");
          await page
            .getByRole("link", { name: "Account", exact: true })
            .click();
          await expect(page.locator("h1")).toHaveText("Sign in");
          await page.getByLabel("Password").fill("demo");
          await page
            .getByRole("button", { name: "Sign in", exact: true })
            .click();
          await expect(page.locator("#owner")).toHaveText("alice");
          assert.equal(
            await page.evaluate(() => document.cookie.includes("demo_session")),
            false,
          );
          const previous = await backend.db
            .prepare("SELECT writes FROM notes WHERE owner = 'alice'")
            .first();
          const rejected = await page.request.post(
            new URL("/api/notes", backend.url).href,
            {
              form: { value: "Forged note", csrf: "invalid" },
            },
          );
          assert.equal(rejected.status(), 403);
          assert.equal(
            (
              await backend.db
                .prepare("SELECT writes FROM notes WHERE owner = 'alice'")
                .first()
            ).writes,
            previous.writes,
          );
          await page.getByLabel("Note", { exact: true }).fill("Updated note");
          await page.getByRole("button", { name: "Save", exact: true }).click();
          await expect(page.locator("#saved-note")).toHaveText("Updated note");
          const row = await backend.db
            .prepare("SELECT value, writes FROM notes WHERE owner = 'alice'")
            .first();
          assert.equal(row.value, "Updated note");
          assert.equal(row.writes, previous.writes + 1);
          const state = await context.storageState();
          await context.close();
          const restarted = await browser.newContext({
            storageState: state,
            ignoreHTTPSErrors: true,
          });
          const restored = await restarted.newPage();
          await restored.goto(new URL("/account", backend.url).href);
          await expect(restored.locator("#owner")).toHaveText("alice");
          await restored
            .getByRole("button", { name: "Sign out", exact: true })
            .click();
          await expect(restored.locator("h1")).toHaveText("Sign in");
          await restored.reload();
          await expect(restored.locator("h1")).toHaveText("Sign in");
          assert.equal(
            (
              await backend.db
                .prepare("SELECT count(*) AS count FROM sessions")
                .first()
            ).count,
            0,
          );
          await restarted.close();
        } finally {
          await browser.close();
        }
      }
    } finally {
      await backend.close();
    }
  },
);
