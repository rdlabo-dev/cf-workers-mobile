import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/workers-capacitor/features";
import type { ContractSuite } from "@rdlabo/workers-capacitor/testing";
// @ts-expect-error Node's public declarations omit this Workers internal entry.
import * as namespace from "node:_stream_passthrough";
import * as s from "node:stream";
const api = namespace as typeof import("./index.js");
export const StreamPassthroughFeature = defineFeature<typeof api>()(
  "node._stream_passthrough",
  ["identity", "behavior"],
);
export const streamPassthroughContract: ContractSuite<
  typeof StreamPassthroughFeature
> = {
  feature: StreamPassthroughFeature,
  cases: {
    identity(value) {
      if (
        (value.default as unknown) !== s.PassThrough ||
        (value.PassThrough as unknown) !== s.PassThrough
      )
        throw Error("Constructor identity mismatch");
      if (
        Object.keys(value).sort().join() !== ["PassThrough", "default"].join()
      )
        throw Error("Alias namespace mismatch");
    },
    async behavior(value) {
      const t = new s.PassThrough();
      const done = (async () => {
        let text = "";
        for await (const v of t) text += v.toString();
        return text;
      })();
      t.end("passthrough");
      if ((await done) !== "passthrough")
        throw Error("PassThrough alias failed");
    },
  },
};
export class StreamPassthroughImplementation extends FeatureImplementation<
  typeof StreamPassthroughFeature
> {
  constructor() {
    super(StreamPassthroughFeature, {
      identity: { status: "supported" },
      behavior: { status: "supported" },
    });
  }
  create() {
    return api;
  }
}
