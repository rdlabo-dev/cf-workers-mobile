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

test("physical iOS rejects a local test CA and still closes the backend", async () => {
  const artifacts = await mkdtemp(join(tmpdir(), "native-acceptance-"));
  const previous = {
    physical: process.env.IOS_PHYSICAL_DEVICE,
    team: process.env.IOS_DEVELOPMENT_TEAM,
  };
  let closed = 0;
  process.env.IOS_PHYSICAL_DEVICE = "1";
  process.env.IOS_DEVELOPMENT_TEAM = "test-team";
  try {
    await assert.rejects(
      runNativeAcceptance({
        artifacts,
        platform: "ios",
        device: "test-device",
        backend: {
          ca: "/test-ca.pem",
          reports: [],
          requests: [],
          close: async () => {
            closed++;
          },
        },
      }),
      /deployed HTTPS backend/,
    );
    assert.equal(closed, 1);
  } finally {
    for (const [key, value] of [
      ["IOS_PHYSICAL_DEVICE", previous.physical],
      ["IOS_DEVELOPMENT_TEAM", previous.team],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(artifacts, { recursive: true });
  }
});
