import * as consumers from "node:stream/consumers";
import { Buffer } from "node:buffer";
import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/workers-capacitor/features";
import type { ContractSuite } from "@rdlabo/workers-capacitor/testing";
const api = consumers as unknown as typeof import("./index.js");
function same(a: unknown, b: unknown) {
  if (a !== b) throw Error(`${String(a)} != ${String(b)}`);
}
function equal(a: unknown, b: unknown) {
  same(JSON.stringify(a), JSON.stringify(b));
}
async function* chunks(...values: unknown[]) {
  yield* values;
}
export const streamConsumersFeature = defineFeature<typeof api>()(
  "node.stream/consumers",
  [
    "surface",
    "blob",
    "arrayBuffer",
    "buffer",
    "text",
    "decoder",
    "json",
    "empty",
    "errors",
    "iteration",
  ] as const,
);
export const streamConsumersContract: ContractSuite<
  typeof streamConsumersFeature
> = {
  feature: streamConsumersFeature,
  cases: {
    surface(api) {
      const names = ["arrayBuffer", "blob", "buffer", "text", "json"];
      equal(Object.keys(api).sort(), [...names, "default"].sort());
      equal(Object.keys(api.default).sort(), names.sort());
      for (const name of names)
        same((api.default as any)[name], (api as any)[name]);
    },
    async blob(api) {
      const blob = await api.blob(
        chunks("hello", new Uint8Array([32, 119, 111, 114, 108, 100])),
      );
      same(blob.size, 11);
      same(blob.type, "");
      same(await blob.text(), "hello world");
      same(blob instanceof Blob, true);
    },
    async arrayBuffer(api) {
      const result = await api.arrayBuffer(
        chunks(new Uint8Array([1, 2]), new Uint8Array([3])),
      );
      same(result instanceof ArrayBuffer, true);
      equal([...new Uint8Array(result)], [1, 2, 3]);
    },
    async buffer(api) {
      const result = await api.buffer(chunks("ab", Buffer.from("cd")));
      same(Buffer.isBuffer(result), true);
      same(result.toString(), "abcd");
    },
    async text(api) {
      same(await api.text(chunks("a", new Uint8Array([98, 99]), "d")), "abcd");
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array([104, 105]));
          c.close();
        },
      });
      same(await api.text(stream), "hi");
      same(stream.locked, false);
    },
    async decoder(api) {
      same(
        await api.text(
          chunks(
            new Uint8Array([0xe3]),
            new Uint8Array([0x81]),
            new Uint8Array([0x82]),
          ),
        ),
        "あ",
      );
      same(await api.text(chunks(new Uint8Array([0xe3]))), "�");
      same(
        await api.text(
          chunks(
            new Uint8Array([0xe3]),
            "middle",
            new Uint8Array([0x81, 0x82]),
          ),
        ),
        "middleあ",
      );
    },
    async json(api) {
      equal(
        await api.json(chunks('{"a":', new Uint8Array([49]), ',"b":[true]}')),
        { a: 1, b: [true] },
      );
      let error;
      try {
        await api.json(chunks("{"));
      } catch (e) {
        error = e;
      }
      same(error instanceof SyntaxError, true);
    },
    async empty(api) {
      same(await api.text(chunks()), "");
      same((await api.blob(chunks())).size, 0);
      same((await api.arrayBuffer(chunks())).byteLength, 0);
      same((await api.buffer(chunks())).length, 0);
      let error;
      try {
        await api.json(chunks());
      } catch (e) {
        error = e;
      }
      same(error instanceof SyntaxError, true);
    },
    async errors(api) {
      const failure = new Error("source failure");
      for (const name of [
        "blob",
        "arrayBuffer",
        "buffer",
        "text",
        "json",
      ] as const) {
        async function* input() {
          yield new Uint8Array([49]);
          throw failure;
        }
        let error;
        try {
          await api[name](input());
        } catch (e) {
          error = e;
        }
        same(error, failure);
      }
    },
    async iteration(api) {
      same(await api.text([Promise.resolve("a"), Promise.resolve("b")]), "ab");
      same(await (await api.blob({ 0: "a", 1: "b", length: 2 })).text(), "ab");
      let closed = false;
      async function* invalid() {
        try {
          yield 123;
          yield "unused";
        } finally {
          closed = true;
        }
      }
      let error;
      try {
        await api.text(invalid());
      } catch (e) {
        error = e;
      }
      same(error instanceof TypeError, true);
      same(closed, true);
      let canceled = false;
      const invalidStream = new ReadableStream({
        start(controller) {
          controller.enqueue(123);
        },
        cancel() {
          canceled = true;
        },
      });
      let streamError;
      try {
        await api.text(invalidStream);
      } catch (error) {
        streamError = error;
      }
      same(streamError instanceof TypeError, true);
      same(canceled, true);
      same(invalidStream.locked, false);
    },
  },
};
export class StreamConsumersImplementation extends FeatureImplementation<
  typeof streamConsumersFeature
> {
  constructor() {
    super(
      streamConsumersFeature,
      Object.fromEntries(
        streamConsumersFeature.cases.map((name) => [
          name,
          { status: "supported" },
        ]),
      ) as never,
    );
  }
  create() {
    return api;
  }
}
