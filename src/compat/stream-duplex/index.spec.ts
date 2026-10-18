import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/workers-capacitor/features";
import type { ContractSuite } from "@rdlabo/workers-capacitor/testing";
// @ts-expect-error Node's public declarations omit this Workers internal entry.
import * as namespace from "node:_stream_duplex";
import * as s from "node:stream";
const api = namespace as typeof import("./index.js");
export const StreamDuplexFeature = defineFeature<typeof api>()(
  "node._stream_duplex",
  ["identity", "behavior"],
);
export const streamDuplexContract: ContractSuite<typeof StreamDuplexFeature> = {
  feature: StreamDuplexFeature,
  cases: {
    identity(value) {
      if (
        (value.default as unknown) !== s.Duplex ||
        (value.Duplex as unknown) !== s.Duplex
      )
        throw Error("Constructor identity mismatch");
      if (
        Object.keys(value).sort().join() !==
        ["Duplex", "default", "from", "fromWeb", "toWeb"].join()
      )
        throw Error("Alias namespace mismatch");
    },
    async behavior(value) {
      if (
        value.from !== s.Duplex.from ||
        value.fromWeb !== s.Duplex.fromWeb ||
        value.toWeb !== s.Duplex.toWeb
      )
        throw Error("Duplex helpers lost identity");
      try {
        s.Duplex.from([1, 2]);
      } catch (error) {
        if ((error as { code: string }).code === "ERR_INVALID_ARG_TYPE") return;
        throw error;
      }
      throw Error("Pinned Workers rejects iterable Duplex.from inputs");
    },
  },
};
export class StreamDuplexImplementation extends FeatureImplementation<
  typeof StreamDuplexFeature
> {
  constructor() {
    super(StreamDuplexFeature, {
      identity: { status: "supported" },
      behavior: { status: "supported" },
    });
  }
  create() {
    return api;
  }
}
