import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";
import * as namespace from "node:stream/web";
const web = namespace as unknown as typeof import("./index.js");
export const streamWebFeature = defineFeature<typeof web>()("node.stream-web", [
  "constructors",
]);
export const streamWebContract: ContractSuite<typeof streamWebFeature> = {
  feature: streamWebFeature,
  cases: {
    constructors(api) {
      if (!(api.ReadableStream.prototype instanceof Object))
        throw new Error("ReadableStream missing");
      for (const name of [
        "ReadableStream",
        "WritableStream",
        "TransformStream",
      ] as const)
        if (typeof api[name] !== "function") throw new Error(`${name} missing`);
      const readable = new api.ReadableStream({
        start(c) {
          c.enqueue(1);
          c.close();
        },
      });
      if (!(readable instanceof api.ReadableStream))
        throw new Error("ReadableStream construction failed");
    },
  },
};
export class StreamWebImplementation extends FeatureImplementation<
  typeof streamWebFeature
> {
  constructor(private readonly api = web) {
    super(streamWebFeature, {
      constructors: { status: "supported" },
    });
  }
  create() {
    return this.api;
  }
}
