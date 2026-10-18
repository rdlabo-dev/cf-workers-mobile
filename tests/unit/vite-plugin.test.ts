import { expect, it } from "vitest";
import { capacitorWorkersPlugin } from "../../src/vite.js";

function names(plugins: ReturnType<typeof capacitorWorkersPlugin>) {
  return plugins.flatMap((plugin) =>
    plugin && typeof plugin === "object" && "name" in plugin
      ? [plugin.name]
      : [],
  );
}

it("bootstraps host globals only for the explicit static Worker route", () => {
  expect(names(capacitorWorkersPlugin())).toContain(
    "capacitor-workers-global-install",
  );
  expect(names(capacitorWorkersPlugin({ worker: "worker.ts" }))).not.toContain(
    "capacitor-workers-global-install",
  );
});

it("always bootstraps globals in the private Worker build", () => {
  const plugins = capacitorWorkersPlugin({ worker: "worker.ts" });
  const buildPlugin = plugins.find(
    (plugin) =>
      plugin &&
      typeof plugin === "object" &&
      "name" in plugin &&
      plugin.name === "capacitor-workers-worker-build",
  );
  const config = (
    buildPlugin as unknown as { config(config: object): unknown }
  ).config({});
  const workerPlugins = (
    config as {
      worker: { plugins(): ReturnType<typeof capacitorWorkersPlugin> };
    }
  ).worker.plugins();
  expect(names(workerPlugins)).toContain("capacitor-workers-global-install");
});

it("does not install Web APIs in an unconfigured host bundle", () => {
  const plugin = capacitorWorkersPlugin().find(
    (plugin) =>
      plugin &&
      typeof plugin === "object" &&
      "name" in plugin &&
      plugin.name === "capacitor-workers-global-install",
  ) as unknown as { transform(code: string, id: string): string };
  const result = plugin.transform(
    "export const value = 1",
    "/consumer/main.ts",
  );
  expect(result).toContain("globals/node-install.js");
  expect(result).not.toContain("globals/install.js");
});
