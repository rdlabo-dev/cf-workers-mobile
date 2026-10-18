import { defineFeature } from "@rdlabo/workers-capacitor/shared/contracts";
import type { ContractSuite } from "@rdlabo/workers-capacitor/shared/contracts/testing";
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
export const wasmFeature = defineFeature<{
  validate(bytes: Uint8Array<ArrayBuffer>): boolean;
}>()("engine.wasm-validation", ["valid", "invalid"]);
export const wasmContract: ContractSuite<typeof wasmFeature> = {
  feature: wasmFeature,
  cases: {
    valid(api) {
      equal(api.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])), true);
    },
    invalid(api) {
      equal(api.validate(new Uint8Array([1, 2, 3])), false);
    },
  },
};
