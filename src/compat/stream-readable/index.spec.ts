import {
  defineFeature,
  FeatureImplementation,
} from "cf-workers-native/shared/contracts";
import type { ContractSuite } from "cf-workers-native/shared/contracts/testing";
// @ts-expect-error Node's public declarations omit this Workers internal entry.
import * as namespace from "node:_stream_readable";
import * as s from "node:stream";
const api = namespace as typeof import("./index.js");
export const StreamReadableFeature = defineFeature<typeof api>()(
  "node._stream_readable",
  ["identity", "behavior"],
);
export const streamReadableContract: ContractSuite<
  typeof StreamReadableFeature
> = {
  feature: StreamReadableFeature,
  cases: {
    identity(value) {
      if (
        (value.default as unknown) !== s.Readable ||
        (value.Readable as unknown) !== s.Readable
      )
        throw Error("Constructor identity mismatch");
      if (
        Object.keys(value).sort().join() !==
        [
          "Readable",
          "ReadableState",
          "default",
          "from",
          "fromWeb",
          "toWeb",
          "wrap",
        ].join()
      )
        throw Error("Alias namespace mismatch");
    },
    async behavior(value) {
      const r = value.from(value.Readable, [1, 2], undefined);
      const values = [];
      for await (const value of r) values.push(value);
      if (values.join() !== "1,2") throw Error("Readable alias failed");
      if (
        value.fromWeb !== s.Readable.fromWeb ||
        value.toWeb !== s.Readable.toWeb ||
        value.wrap !== (s.Readable as any).wrap
      )
        throw Error("Readable helpers lost identity");
    },
  },
};
export class StreamReadableImplementation extends FeatureImplementation<
  typeof StreamReadableFeature
> {
  constructor() {
    super(StreamReadableFeature, {
      identity: { status: "supported" },
      behavior: { status: "supported" },
    });
  }
  create() {
    return api;
  }
}
