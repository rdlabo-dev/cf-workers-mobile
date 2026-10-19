import {
  defineFeature,
  FeatureImplementation,
} from "workers-capacitor/shared/contracts";
import type { ContractSuite } from "workers-capacitor/shared/contracts/testing";
// @ts-expect-error The pinned Workers builtin is not declared by @types/node.
import * as actual from "node:_http_client";
import * as http from "node:http";
const api = actual as typeof import("./index.js");
const names = ["ClientRequest"] as const;
function same(a: unknown, b: unknown) {
  if (a !== b) throw Error("Identity mismatch");
}
export const httpClientFeature = defineFeature<typeof api>()(
  "node._http_client",
  ["surface", "identity"] as const,
);
export const httpClientContract: ContractSuite<typeof httpClientFeature> = {
  feature: httpClientFeature,
  cases: {
    surface(api) {
      same(
        JSON.stringify(Object.keys(api).sort()),
        JSON.stringify([...names, "default"].sort()),
      );
      same(
        JSON.stringify(Object.keys(api.default).sort()),
        JSON.stringify([...names].sort()),
      );
      for (const name of names) same(api.default[name], api[name]);
    },
    identity(api) {
      // These modules only re-export references. Identity proves they share
      // the implementation exercised by the accepted node:http contract.
      for (const name of names) same(api[name], http[name]);
    },
  },
};
export class HttpClientImplementation extends FeatureImplementation<
  typeof httpClientFeature
> {
  constructor() {
    super(httpClientFeature, {
      surface: { status: "supported" },
      identity: { status: "supported" },
    });
  }
  create() {
    return api;
  }
}
