import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";
import * as util from "./index.js";
export const utilFeature = defineFeature<typeof util>()("node.util", [
  "encoders",
  "polyfill",
]);
export const utilContract: ContractSuite<typeof utilFeature> = {
  feature: utilFeature,
  cases: {
    encoders(api) {
      const bytes = new api.TextEncoder().encode("ok");
      if (new api.TextDecoder().decode(bytes) !== "ok")
        throw new Error("TextEncoder/TextDecoder mismatch");
    },
    polyfill(api) {
      if (typeof (api as { promisify?: unknown }).promisify !== "function")
        throw new Error("util.promisify missing");
    },
  },
};
export class UtilImplementation extends FeatureImplementation<
  typeof utilFeature
> {
  constructor(private readonly api = util) {
    super(utilFeature, {
      encoders: { status: "supported" },
      polyfill: { status: "supported" },
    });
  }
  create() {
    return this.api;
  }
}
