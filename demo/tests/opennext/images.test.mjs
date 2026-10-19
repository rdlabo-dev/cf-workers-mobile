import { test } from "node:test";
import assert from "node:assert/strict";
import { startBackend } from "./backend.mjs";
test(
  "OpenNext optimizes local PNG via the Images binding",
  { timeout: 30000 },
  async () => {
    const backend = await startBackend();
    try {
      const response = await backend.fetch(
        "/_next/image?url=%2Fimage.png&w=128&q=75",
        { headers: { accept: "image/webp" } },
      );
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal(response.headers.get("content-type"), "image/webp");
      const body = new Uint8Array(await response.arrayBuffer());
      assert.equal(new TextDecoder().decode(body.slice(0, 4)), "RIFF");
      assert.equal(new TextDecoder().decode(body.slice(8, 12)), "WEBP");
    } finally {
      await backend.close();
    }
  },
);
