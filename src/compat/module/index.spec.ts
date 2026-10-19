import {
  defineFeature,
  FeatureImplementation,
} from "workers-capacitor/shared/contracts";
import type { ContractSuite } from "workers-capacitor/shared/contracts/testing";
import * as mod from "./index.js";
export const moduleFeature = defineFeature<typeof mod>()("node.module", [
  "builtin",
  "createRequire",
]);
const equal = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
};
export const moduleContract: ContractSuite<typeof moduleFeature> = {
  feature: moduleFeature,
  cases: {
    builtin(api) {
      equal(api.isBuiltin("node:fs"), true);
      equal(api.isBuiltin("fs"), true);
      equal(api.isBuiltin("react"), false);
      equal(Array.isArray(api.builtinModules), true);
    },
    createRequire(api) {
      const require = api.createRequire("/worker.js");
      equal(typeof require, "function");
      equal((require("/app/data.json") as { ok: boolean }).ok, true);
      try {
        require("./page.js");
        throw new Error("Expected throw");
      } catch (error) {
        if (!String(error).includes("executable")) throw error;
      }
    },
  },
};
export class ModuleImplementation extends FeatureImplementation<
  typeof moduleFeature
> {
  constructor(private readonly api = mod) {
    super(moduleFeature, {
      builtin: { status: "supported" },
      createRequire: { status: "supported" },
    });
  }
  async create() {
    const { registerVirtualFiles } = await import("../fs/index.js");
    registerVirtualFiles({ "/app/data.json": '{"ok":true}' });
    return this.api;
  }
}
