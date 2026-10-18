import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";
// @ts-expect-error Node's public declarations omit this Workers internal entry.
import * as namespace from "node:_stream_transform";
import * as s from "node:stream";
const api = namespace as typeof import("./index.js");
export const StreamTransformFeature = defineFeature<typeof api>()(
  "node._stream_transform",
  ["identity", "behavior"],
);
export const streamTransformContract: ContractSuite<
  typeof StreamTransformFeature
> = {
  feature: StreamTransformFeature,
  cases: {
    identity(value) {
      if (
        (value.default as unknown) !== s.Transform ||
        (value.Transform as unknown) !== s.Transform
      )
        throw Error("Constructor identity mismatch");
      if (Object.keys(value).sort().join() !== ["Transform", "default"].join())
        throw Error("Alias namespace mismatch");
    },
    async behavior(value) {
      const t = new s.Transform({
        transform(chunk, _encoding, callback) {
          callback(null, chunk);
        },
      });
      const done = (async () => {
        let text = "";
        for await (const v of t) text += v.toString();
        return text;
      })();
      t.end("transform");
      if ((await done) !== "transform") throw Error("Transform alias failed");
    },
  },
};
export class StreamTransformImplementation extends FeatureImplementation<
  typeof StreamTransformFeature
> {
  constructor() {
    super(StreamTransformFeature, {
      identity: { status: "supported" },
      behavior: { status: "supported" },
    });
  }
  create() {
    return api;
  }
}
