import { expect, it } from "vitest";
import type { Plugin } from "vite";
import { workersCapacitorPlugin } from "../../src/vite";

it("does not transform ordinary files sharing the generated-entry suffix", () => {
  const plugin = workersCapacitorPlugin().find(
    (plugin) => (plugin as Plugin).name === "workers-capacitor-entry",
  ) as Plugin;
  const load = plugin.load as (id: string) => unknown;
  expect(load("/app/example.workers-capacitor-worker.js")).toBeUndefined();
  expect(
    load("/app/example.workers-capacitor-worker.js?worker_file&type=module"),
  ).toBeUndefined();
});
