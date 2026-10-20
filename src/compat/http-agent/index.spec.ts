import {
  defineFeature,
  FeatureImplementation,
} from "cf-workers-mobile/shared/contracts";
import type { ContractSuite } from "cf-workers-mobile/shared/contracts/testing";
// @ts-expect-error The pinned Workers builtin is not declared by @types/node.
import * as actual from "node:_http_agent";
import * as http from "node:http";
const api = actual as typeof import("./index.js");
const names = ["Agent", "globalAgent"] as const;
function same(a: unknown, b: unknown) {
  if (a !== b) throw Error("Identity mismatch");
}
export const httpAgentFeature = defineFeature<typeof api>()(
  "node._http_agent",
  ["surface", "identity"] as const,
);
export const httpAgentContract: ContractSuite<typeof httpAgentFeature> = {
  feature: httpAgentFeature,
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
export class HttpAgentImplementation extends FeatureImplementation<
  typeof httpAgentFeature
> {
  constructor() {
    super(httpAgentFeature, {
      surface: { status: "supported" },
      identity: { status: "supported" },
    });
  }
  create() {
    return api;
  }
}
