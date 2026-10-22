import constants, * as namespace from "node:constants";
import {
  defineFeature,
  FeatureImplementation,
} from "cf-workers-native/shared/contracts";
import type { ContractSuite } from "cf-workers-native/shared/contracts/testing";
import { expectedValues } from "./values.spec";
export const constantsFeature = defineFeature<typeof constants>()(
  "node.constants",
  ["exports", "values", "descriptors"],
);
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
export const constantsContract: ContractSuite<typeof constantsFeature> = {
  feature: constantsFeature,
  cases: {
    exports(api) {
      equal(Object.keys(api).sort(), Object.keys(expectedValues).sort());
      equal(
        Object.keys(namespace).sort(),
        [...Object.keys(expectedValues), "default"].sort(),
      );
    },
    values(api) {
      for (const [key, value] of Object.entries(expectedValues)) {
        equal(api[key as keyof typeof api], value);
        equal(namespace[key as keyof typeof api], value);
      }
    },
    descriptors(api) {
      for (const key of Object.keys(expectedValues)) {
        const d = Object.getOwnPropertyDescriptor(api, key)!;
        equal(d.enumerable, true);
        equal(d.writable, false);
        equal(d.configurable, true);
      }
      const d = Object.getOwnPropertyDescriptor(api, "EACCES")!;
      equal(Reflect.set(api, "EACCES", 123), false);
      equal(api.EACCES, expectedValues.EACCES);
      try {
        Object.defineProperty(api, "EACCES", { value: 123 });
        equal(api.EACCES, 123);
      } finally {
        Object.defineProperty(api, "EACCES", d);
      }
      equal(Object.isExtensible(api), true);
    },
  },
};
export class ConstantsImplementation extends FeatureImplementation<
  typeof constantsFeature
> {
  constructor() {
    super(constantsFeature, {
      exports: { status: "supported" },
      values: { status: "supported" },
      descriptors: { status: "supported" },
    });
  }
  create() {
    return constants;
  }
}
