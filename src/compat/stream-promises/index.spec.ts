import {
  defineFeature,
  FeatureImplementation,
} from "workers-capacitor/shared/contracts";
import type { ContractSuite } from "workers-capacitor/shared/contracts/testing";
import * as namespace from "node:stream/promises";
const api = namespace as typeof namespace & {
  default: typeof namespace;
  promises: typeof namespace;
};
import * as s from "node:stream";
export const streamPromisesFeature = defineFeature<typeof api>()(
  "node.stream/promises",
  ["identity", "pipeline"],
);
export const streamPromisesContract: ContractSuite<
  typeof streamPromisesFeature
> = {
  feature: streamPromisesFeature,
  cases: {
    identity(value) {
      if (
        value.default !== s.promises ||
        value.promises !== s.promises ||
        value.finished !== s.promises.finished ||
        value.pipeline !== s.promises.pipeline
      )
        throw Error("Promise identity mismatch");
    },
    async pipeline(value) {
      const values: unknown[] = [];
      await value.pipeline(
        s.Readable.from([1, 2]),
        new s.Writable({
          objectMode: true,
          write(chunk, _encoding, callback) {
            values.push(chunk);
            callback();
          },
        }),
      );
      if (values.join() !== "1,2") throw Error("Promise pipeline failed");
    },
  },
};
export class StreamPromisesImplementation extends FeatureImplementation<
  typeof streamPromisesFeature
> {
  constructor() {
    super(streamPromisesFeature, {
      identity: { status: "supported" },
      pipeline: { status: "supported" },
    });
  }
  create() {
    return api;
  }
}
