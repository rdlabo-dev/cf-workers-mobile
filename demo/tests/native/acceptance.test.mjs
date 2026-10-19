import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runNativeAcceptance } from "./acceptance.mjs";

test("invalid native configuration closes the already-started backend", async () => {
  const artifacts = await mkdtemp(join(tmpdir(), "native-acceptance-"));
  let closed = 0;
  try {
    await assert.rejects(
      runNativeAcceptance({
        artifacts,
        platform: "invalid",
        device: "",
        backend: {
          reports: [],
          requests: [],
          close: async () => {
            closed++;
          },
        },
      }),
      /Set UPSTREAM_PLATFORM/,
    );
    assert.equal(closed, 1);
  } finally {
    await rm(artifacts, { recursive: true });
  }
});
