import { expect, it } from "vitest";
import { workersCapacitorPlugin } from "../../src/vite.js";

function names(plugins: ReturnType<typeof workersCapacitorPlugin>) {
  return plugins.flatMap((plugin) =>
    plugin && typeof plugin === "object" && "name" in plugin
      ? [plugin.name]
      : [],
  );
}

it("bootstraps host globals only for the explicit static Worker route", () => {
  expect(names(workersCapacitorPlugin())).toContain(
    "workers-capacitor-global-install",
  );
  expect(names(workersCapacitorPlugin({ worker: "worker.ts" }))).not.toContain(
    "workers-capacitor-global-install",
  );
});

it("always bootstraps globals in the private Worker build", () => {
  const plugins = workersCapacitorPlugin({ worker: "worker.ts" });
  const buildPlugin = plugins.find(
    (plugin) =>
      plugin &&
      typeof plugin === "object" &&
      "name" in plugin &&
      plugin.name === "workers-capacitor-worker-build",
  );
  const config = (
    buildPlugin as unknown as { config(config: object): unknown }
  ).config({});
  const workerPlugins = (
    config as {
      worker: { plugins(): ReturnType<typeof workersCapacitorPlugin> };
    }
  ).worker.plugins();
  expect(names(workerPlugins)).toContain("workers-capacitor-global-install");
});

it("does not install Web APIs in an unconfigured host bundle", () => {
  const plugin = workersCapacitorPlugin().find(
    (plugin) =>
      plugin &&
      typeof plugin === "object" &&
      "name" in plugin &&
      plugin.name === "workers-capacitor-global-install",
  ) as unknown as { transform(code: string, id: string): string };
  const result = plugin.transform(
    "export const value = 1",
    "/consumer/main.ts",
  );
  expect(result).toContain("globals/node-install.js");
  expect(result).not.toContain("globals/install.js");
});
