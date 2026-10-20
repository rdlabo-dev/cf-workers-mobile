import {
  defineFeature,
  FeatureImplementation,
} from "cf-workers-mobile/shared/contracts";
import type { ContractSuite } from "cf-workers-mobile/shared/contracts/testing";
// @ts-expect-error Node's public declarations omit this Workers internal entry.
import * as namespace from "node:_stream_writable";
import * as s from "node:stream";
const api = namespace as typeof import("./index.js");
export const StreamWritableFeature = defineFeature<typeof api>()(
  "node._stream_writable",
  ["identity", "behavior"],
);
export const streamWritableContract: ContractSuite<
  typeof StreamWritableFeature
> = {
  feature: StreamWritableFeature,
  cases: {
    identity(value) {
      if (
        (value.default as unknown) !== s.Writable ||
        (value.Writable as unknown) !== s.Writable
      )
        throw Error("Constructor identity mismatch");
      if (
        Object.keys(value).sort().join() !==
        ["Writable", "WritableState", "default", "fromWeb", "toWeb"].join()
      )
        throw Error("Alias namespace mismatch");
    },
    async behavior(value) {
      const w = new s.Writable({
        write(_c: unknown, _e: unknown, cb: () => void) {
          cb();
        },
      });
      w.end("x");
      await s.promises.finished(w);
      if (
        value.toWeb !== s.Writable.toWeb ||
        value.fromWeb !== s.Writable.fromWeb
      )
        throw Error("Writable helpers lost identity");
    },
  },
};
export class StreamWritableImplementation extends FeatureImplementation<
  typeof StreamWritableFeature
> {
  constructor() {
    super(StreamWritableFeature, {
      identity: { status: "supported" },
      behavior: { status: "supported" },
    });
  }
  create() {
    return api;
  }
}
