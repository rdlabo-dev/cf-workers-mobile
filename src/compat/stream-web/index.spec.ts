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
    async constructors(api) {
      if (!(api.ReadableStream.prototype instanceof Object))
        throw new Error("ReadableStream missing");
      for (const name of [
        "ReadableStream",
        "WritableStream",
        "TransformStream",
        "ByteLengthQueuingStrategy",
        "CountQueuingStrategy",
        "ReadableByteStreamController",
        "ReadableStreamBYOBReader",
        "ReadableStreamBYOBRequest",
        "ReadableStreamDefaultController",
        "ReadableStreamDefaultReader",
        "TransformStreamDefaultController",
        "WritableStreamDefaultController",
        "WritableStreamDefaultWriter",
      ] as const)
        if (typeof api[name] !== "function") throw new Error(`${name} missing`);
      for (const [name, value] of Object.entries(api.default)) {
        if ((api as any)[name] !== value)
          throw Error(`Default identity mismatch: ${name}`);
      }
      const byteStrategy = new api.ByteLengthQueuingStrategy({
        highWaterMark: 3,
      });
      if (
        byteStrategy.highWaterMark !== 3 ||
        byteStrategy.size(new Uint8Array(2)) !== 2
      )
        throw Error("Byte strategy mismatch");
      const countStrategy = new api.CountQueuingStrategy({ highWaterMark: 2 });
      if (
        countStrategy.highWaterMark !== 2 ||
        countStrategy.size("value") !== 1
      )
        throw Error("Count strategy mismatch");
      let readableController: unknown;
      const readable = new api.ReadableStream({
        start(c) {
          readableController = c;
          c.enqueue(1);
          c.close();
        },
      });
      if (!(readable instanceof api.ReadableStream))
        throw new Error("ReadableStream construction failed");
      if (!(readableController instanceof api.ReadableStreamDefaultController))
        throw Error("Readable controller mismatch");
      const reader = readable.getReader();
      if (!(reader instanceof api.ReadableStreamDefaultReader))
        throw Error("Readable reader mismatch");
      await reader.read();
      reader.releaseLock();
      let writableController: unknown;
      const writable = new api.WritableStream({
        start(c) {
          writableController = c;
        },
      });
      if (!(writableController instanceof api.WritableStreamDefaultController))
        throw Error("Writable controller mismatch");
      const writer = writable.getWriter();
      if (!(writer instanceof api.WritableStreamDefaultWriter))
        throw Error("Writable writer mismatch");
      await writer.close();
      writer.releaseLock();
      let transformController: unknown;
      const transform = new api.TransformStream({
        start(c) {
          transformController = c;
        },
      });
      if (
        !(transformController instanceof api.TransformStreamDefaultController)
      )
        throw Error("Transform controller mismatch");
      await transform.readable.cancel();
      let byteController: unknown, byobRequest: unknown;
      const bytes = new api.ReadableStream({
        type: "bytes",
        start(c) {
          byteController = c;
        },
        pull(c) {
          byobRequest = c.byobRequest;
          new Uint8Array(c.byobRequest!.view!.buffer)[0] = 7;
          c.byobRequest!.respond(1);
          c.close();
        },
      });
      if (!(byteController instanceof api.ReadableByteStreamController))
        throw Error("Byte controller mismatch");
      const byob = bytes.getReader({ mode: "byob" });
      if (!(byob instanceof api.ReadableStreamBYOBReader))
        throw Error("BYOB reader mismatch");
      const result = await byob.read(new Uint8Array(1));
      if (
        !(byobRequest instanceof api.ReadableStreamBYOBRequest) ||
        result.value?.[0] !== 7
      )
        throw Error("BYOB request mismatch");
      byob.releaseLock();
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
