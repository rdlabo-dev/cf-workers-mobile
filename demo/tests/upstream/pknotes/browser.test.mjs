import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { startBackend } from "./backend.mjs";
test(
  "pknotes PRF registration, encrypted storage and unlock after reload",
  { timeout: 60000 },
  async () => {
    const backend = await startBackend({ instrument: () => false });
    let browser;
    try {
      browser = await chromium.launch();
      const context = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send("WebAuthn.enable");
      await cdp.send("WebAuthn.addVirtualAuthenticator", {
        options: {
          protocol: "ctap2",
          ctap2Version: "ctap2_1",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
          hasPrf: true,
        },
      });
      await page.goto(backend.url.href);
      await page
        .getByRole("tab", { name: "Create account", exact: true })
        .click();
      await page.getByPlaceholder("username").fill("acceptance");
      await page
        .getByRole("button", { name: "Create account with passkey" })
        .click();
      await page
        .getByRole("heading", { name: "Save your recovery code" })
        .waitFor();
      await page
        .getByRole("button", { name: "I saved it — open my notes" })
        .click();
      await page.getByRole("button", { name: "New", exact: true }).click();
      await page.locator(".cm-content").fill("Capacitor encrypted note");
      await page.waitForFunction(() =>
        document.body.innerText.includes("Saved"),
      );
      const notes = await backend.db
        .prepare("SELECT ciphertext FROM notes")
        .all();
      assert.equal(notes.results.length, 1);
      assert.ok(
        !notes.results[0].ciphertext.includes("Capacitor encrypted note"),
      );
      await page.reload();
      await page.getByRole("button", { name: "Unlock with passkey" }).click();
      await page
        .getByText("Capacitor encrypted note", { exact: true })
        .first()
        .waitFor();
      assert.equal(
        (await backend.db.prepare("SELECT count(*) AS n FROM users").first()).n,
        1,
      );
      assert.equal(
        (
          await backend.db
            .prepare("SELECT count(*) AS n FROM credentials")
            .first()
        ).n,
        1,
      );
    } finally {
      try {
        await browser?.close();
      } finally {
        await backend.close();
      }
    }
  },
);
