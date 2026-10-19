import {
  defineFeature,
  FeatureImplementation,
} from "workers-capacitor/shared/contracts";
import type { ContractSuite } from "workers-capacitor/shared/contracts/testing";
import * as namespace from "node:stream/web";
const web = namespace as unknown as typeof import("./index.js");
export const streamWebFeature = defineFeature<typeof web>()("node.stream-web", [
  "constructors",
  "globals",
  "byteStreams",
  "encoding",
  "compression",
  "bodyInterop",
  "bodyFiles",
]);
export const streamWebContract: ContractSuite<typeof streamWebFeature> = {
  feature: streamWebFeature,
  cases: {
    globals(api) {
      for (const [name, value] of Object.entries(api.default))
        if ((globalThis as any)[name] !== value)
          throw Error(`Global identity mismatch: ${name}`);
    },
    async byteStreams(api) {
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
    async encoding(api) {
      const stream = new api.ReadableStream<string>({
        start(c) {
          c.enqueue("hello ");
          c.enqueue("😀");
          c.close();
        },
      });
      const reader = stream
        .pipeThrough(new api.TextEncoderStream())
        .pipeThrough(new api.TextDecoderStream())
        .getReader();
      let text = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          text += value;
        }
      } finally {
        reader.releaseLock();
      }
      if (text !== "hello 😀") throw Error("Encoding stream roundtrip failed");
    },
    async compression(api) {
      const bytes = new TextEncoder().encode("compress this payload");
      const stream = new api.ReadableStream<BufferSource>({
        start(c) {
          c.enqueue(bytes);
          c.close();
        },
      });
      const result = stream
        .pipeThrough(new api.CompressionStream("gzip"))
        .pipeThrough(new api.DecompressionStream("gzip"));
      if ((await new Response(result).text()) !== "compress this payload")
        throw Error("Compression stream roundtrip failed");
    },
    async bodyFiles(api) {
      const blob = await new Response("hello").blob();
      const multipart =
        '--boundary\r\nContent-Disposition: form-data; name="file"; filename="example.txt"\r\nContent-Type: text/plain\r\n\r\nhello\r\n--boundary--\r\n';
      const file = (
        await new Response(multipart, {
          headers: { "content-type": "multipart/form-data; boundary=boundary" },
        }).formData()
      ).get("file");
      if (
        !(file instanceof File) ||
        file.name !== "example.txt" ||
        file.type !== "text/plain"
      )
        throw Error("Parsed file metadata mismatch");
      for (const value of [blob, file]) {
        const stream = value.stream();
        if (!(stream instanceof api.ReadableStream))
          throw Error("Body file stream identity mismatch");
        const reader = stream.getReader({ mode: "byob" });
        try {
          const result = await reader.read(new Uint8Array(16));
          if (new TextDecoder().decode(result.value) !== "hello")
            throw Error("Body file BYOB mismatch");
        } finally {
          await reader.cancel();
          reader.releaseLock();
        }
      }
    },
    async bodyInterop(api) {
      const stream = new api.ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode("body"));
          c.close();
        },
      });
      const response = new Response(stream);
      if (!(response.body instanceof api.ReadableStream) || response.bodyUsed)
        throw Error("Body stream ownership failed");
      const clone = response.clone();
      const values = await Promise.all([response.text(), clone.text()]);
      if (
        values.join() !== "body,body" ||
        !response.bodyUsed ||
        !clone.bodyUsed
      )
        throw Error("Body clone failed");
      const blob = new Blob(["blob"]);
      if (!(blob.stream() instanceof api.ReadableStream))
        throw Error("Blob stream brand failed");
      if ((await new Response(blob.stream()).text()) !== "blob")
        throw Error("Blob body failed");
      const upload = new api.ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array([65]));
          c.close();
        },
      });
      const request = new Request("https://stream.invalid", {
        method: "POST",
        body: upload,
      });
      if ((await request.text()) !== "A" || !request.bodyUsed)
        throw Error("Request body failed");
    },
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
    },
  },
};
export class StreamWebImplementation extends FeatureImplementation<
  typeof streamWebFeature
> {
  constructor(private readonly api = web) {
    super(streamWebFeature, {
      constructors: { status: "supported" },
      globals: { status: "supported" },
      byteStreams: { status: "supported" },
      encoding: { status: "supported" },
      compression: { status: "supported" },
      bodyInterop: { status: "supported" },
      bodyFiles: { status: "supported" },
    });
  }
  create() {
    return this.api;
  }
}
