import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
test(
  "public OpenNext acceptance separates device/control credentials and records route evidence",
  { timeout: 60000 },
  async () => {
    const worker = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: await readFile(
          here("../../../artifacts/opennext-live/worker.js"),
          "utf8",
        ),
        compatibilityDate: "2026-10-17",
        compatibilityFlags: ["nodejs_compat"],
        bindings: {
          ADMIN_TOKEN: "admin-fixture-only",
          DEVICE_TOKEN: "device-fixture-only",
        },
        d1Databases: ["DB"],
        images: { binding: "IMAGES" },
        assets: {
          directory: here("../../../opennext/.open-next/assets"),
          binding: "ASSETS",
          run_worker_first: true,
          routerConfig: { has_user_worker: true },
        },
      }),
    );
    try {
      const db = await worker.getD1Database("DB");
      for (const migration of ["0001.sql", "0002.sql"])
        await db.exec(
          await readFile(
            here("../../../artifacts/opennext-live/migrations/" + migration),
            "utf8",
          ),
        );
      const fetch = (path, token, body) =>
        worker.dispatchFetch("https://acceptance.test" + path, {
          method: body ? "POST" : "GET",
          headers: token
            ? {
                authorization: `Bearer ${token}`,
                "content-type": "application/json",
              }
            : {},
          body: body ? JSON.stringify(body) : undefined,
        });
      assert.equal((await fetch("/api/message")).status, 401);
      assert.equal((await fetch("/api/message", "wrong")).status, 401);
      assert.equal(
        (await fetch("/__acceptance/control", "device-fixture-only")).status,
        403,
      );
      assert.equal(
        (
          await fetch("/__acceptance/control", "device-fixture-only", {
            mode: "flow",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await fetch("/__acceptance/control", "admin-fixture-only", {
            mode: "invalid",
          })
        ).status,
        400,
      );
      const initialized = await fetch(
        "/__acceptance/control",
        "admin-fixture-only",
        { mode: "flow", id: "test", execution: "routes" },
      );
      assert.equal(initialized.status, 200);
      assert.deepEqual((await initialized.json()).requests, []);
      assert.equal(
        (
          await (
            await fetch("/__acceptance/config", "device-fixture-only")
          ).json()
        ).execution,
        "routes",
      );
      const api = await worker.dispatchFetch(
        "https://acceptance.test/api/message",
        {
          headers: {
            authorization: "Bearer device-fixture-only",
            cookie: "unrelated=cookie-sentinel-private",
          },
        },
      );
      assert.equal(api.status, 200);
      assert.equal((await api.json()).message, "Next.js API ready");
      assert.equal(
        (
          await fetch("/__acceptance/report", "device-fixture-only", {
            stage: "hydrated",
          })
        ).status,
        200,
      );
      const state = await (
        await fetch("/__acceptance/control", "admin-fixture-only")
      ).json();
      assert.deepEqual(state.requests, [
        { method: "GET", path: "/api/message" },
      ]);
      assert.equal(state.reports[0].stage, "hydrated");
      assert.equal(state.reports[0].notes.results[0].writes, 0);
      assert.equal(state.sessionCount, 0);
      assert.equal(JSON.stringify(state).includes("fixture-only"), false);
      assert.equal(
        JSON.stringify(state).includes("cookie-sentinel-private"),
        false,
      );
    } finally {
      await worker.dispose();
    }
  },
);
