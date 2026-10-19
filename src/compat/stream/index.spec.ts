import {
  defineFeature,
  FeatureImplementation,
} from "workers-capacitor/shared/contracts";
import type { ContractSuite } from "workers-capacitor/shared/contracts/testing";
import * as api from "node:stream";
type StreamAPI = typeof api &
  Pick<
    typeof import("./index.js"),
    | "destroy"
    | "isDestroyed"
    | "isDisturbed"
    | "_isArrayBufferView"
    | "_isUint8Array"
    | "_uint8ArrayToBuffer"
  >;
const streamApi = api as unknown as StreamAPI;
export const streamFeature = defineFeature<StreamAPI>()("node.stream", [
  "exports",
  "inheritance",
  "highWaterMarks",
  "readable",
  "readableEncoding",
  "iteration",
  "operators",
  "reduce",
  "writable",
  "backpressure",
  "cork",
  "transform",
  "pipeline",
  "pipelineError",
  "finished",
  "abort",
  "duplexPair",
  "readableWeb",
  "writableWeb",
  "duplexWeb",
  "validation",
  "destroy",
  "compose",
  "pipelineCallback",
  "bufferHelpers",
]);
function check(value: unknown, message = "stream mismatch"): asserts value {
  if (!value) throw Error(message);
}
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
async function collect(stream: api.Readable) {
  const values: unknown[] = [];
  for await (const value of stream) values.push(value);
  return values;
}
function errorCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    equal((e as { code: string }).code, code);
    return;
  }
  throw Error("Expected error");
}
export const streamContract: ContractSuite<typeof streamFeature> = {
  feature: streamFeature,
  cases: {
    async compose(s) {
      const twice = new s.Transform({
        objectMode: true,
        transform(chunk, _encoding, callback) {
          callback(null, chunk * 2);
        },
      });
      const plus = new s.Transform({
        objectMode: true,
        transform(chunk, _encoding, callback) {
          callback(null, chunk + 1);
        },
      });
      const stream = s.compose(twice, plus);
      const values = collect(stream);
      stream.write(1);
      stream.end(2);
      equal(await values, [3, 5]);
    },
    async pipelineCallback(s) {
      const values: unknown[] = [];
      const target = new s.Writable({
        objectMode: true,
        write(chunk, _encoding, callback) {
          values.push(chunk);
          callback();
        },
      });
      await new Promise<void>((resolve, reject) => {
        const result = s.pipeline(s.Readable.from([1, 2]), target, (error) =>
          error ? reject(error) : resolve(),
        );
        check(result === target);
      });
      equal(values, [1, 2]);
    },
    bufferHelpers(s) {
      const source = Uint8Array.of(1, 2);
      check(s._isUint8Array(source));
      check(!s._isUint8Array(new Uint16Array(1)));
      check(s._isArrayBufferView(new DataView(new ArrayBuffer(1))));
      check(!s._isArrayBufferView(new ArrayBuffer(1)));
      const buffer = s._uint8ArrayToBuffer(source);
      source[0] = 3;
      equal([...buffer], [3, 2]);
    },
    exports(s) {
      check(s.default === s.Stream);
      for (const name of [
        "Readable",
        "Writable",
        "Duplex",
        "Transform",
        "PassThrough",
        "pipeline",
        "finished",
        "compose",
        "addAbortSignal",
        "destroy",
        "isErrored",
        "isReadable",
        "isWritable",
        "isDestroyed",
        "isDisturbed",
        "getDefaultHighWaterMark",
        "setDefaultHighWaterMark",
        "duplexPair",
      ] as const)
        check((s.default as any)[name] === s[name], name);
      check(s.promises === s.default.promises);
    },
    inheritance(s) {
      const r = new s.Readable({ read() {} }),
        w = new s.Writable({
          write(_c, _e, cb) {
            cb();
          },
        }),
        d = new s.Duplex({
          read() {},
          write(_c, _e, cb) {
            cb();
          },
        }),
        t = new s.Transform({
          transform(c, _e, cb) {
            cb(null, c);
          },
        });
      check(r instanceof s.Stream && w instanceof s.Stream);
      check(d instanceof s.Readable && d instanceof s.Writable);
      check(t instanceof s.Duplex);
      r.destroy();
      w.destroy();
      d.destroy();
      t.destroy();
    },
    highWaterMarks(s) {
      const bytes = s.getDefaultHighWaterMark(false),
        objects = s.getDefaultHighWaterMark(true);
      equal([bytes, objects], [65536, 16]);
      try {
        s.setDefaultHighWaterMark(false, 10);
        s.setDefaultHighWaterMark(true, 2);
        equal(new s.Readable({ read() {} }).readableHighWaterMark, 10);
        equal(
          new s.Writable({
            objectMode: true,
            write(_c, _e, cb) {
              cb();
            },
          }).writableHighWaterMark,
          2,
        );
      } finally {
        s.setDefaultHighWaterMark(false, bytes);
        s.setDefaultHighWaterMark(true, objects);
      }
    },
    async readable(s) {
      const r = s.Readable.from([1, 2, 3]);
      equal(await collect(r), [1, 2, 3]);
      check(r.readableEnded);
      equal(await collect(s.Readable.from("abc")), ["abc"]);
    },
    async readableEncoding(s) {
      const bytes = new TextEncoder().encode("😀é");
      const r = new s.Readable({
        read() {
          this.push(bytes.slice(0, 2));
          this.push(bytes.slice(2, 5));
          this.push(bytes.slice(5));
          this.push(null);
        },
      });
      r.setEncoding("utf8");
      equal((await collect(r)).join(""), "😀é");
    },
    async iteration(s) {
      const r = s.Readable.from([1, 2, 3]);
      for await (const value of r.iterator({ destroyOnReturn: false })) {
        equal(value, 1);
        break;
      }
      check(!r.destroyed);
      equal(await collect(r), [2, 3]);
      const ended = s.Readable.from([1, 2]);
      for await (const value of ended) {
        equal(value, 1);
        break;
      }
      check(ended.destroyed);
    },
    async operators(s) {
      equal(
        await s.Readable.from([1, 2, 3, 4])
          .map(async (x) => x * 2)
          .filter((x) => x > 2)
          .drop(1)
          .take(1)
          .toArray(),
        [6],
      );
      equal(
        await s.Readable.from([1, 2])
          .flatMap((x) => [x, x + 10])
          .toArray(),
        [1, 11, 2, 12],
      );
    },
    async reduce(s) {
      equal(await s.Readable.from([1, 2, 3]).reduce((a, x) => a + x, 0), 6);
      equal(await s.Readable.from([1, 2, 3]).some((x) => x === 2), true);
      equal(await s.Readable.from([1, 2, 3]).every((x) => x < 4), true);
      equal(await s.Readable.from([1, 2, 3]).find((x) => x > 1), 2);
    },
    async writable(s) {
      const values: string[] = [];
      const w = new s.Writable({
        write(c, e, cb) {
          values.push(`${e}:${c.toString()}`);
          cb();
        },
        final(cb) {
          values.push("final");
          cb();
        },
      });
      const done = s.promises.finished(w);
      w.write("a");
      w.end("b");
      await done;
      equal(values, ["buffer:a", "buffer:b", "final"]);
      check(w.writableFinished);
    },
    async backpressure(s) {
      let finish: (() => void) | undefined;
      const w = new s.Writable({
        highWaterMark: 1,
        write(_c, _e, cb) {
          finish = cb;
        },
      });
      check(w.write("a") === false);
      check(w.writableNeedDrain);
      const drain = new Promise<void>((resolve) => w.once("drain", resolve));
      finish!();
      await drain;
      check(!w.writableNeedDrain);
      w.end();
      await s.promises.finished(w);
    },
    async cork(s) {
      const calls: string[] = [];
      const w = new s.Writable({
        write(c, _e, cb) {
          calls.push(c.toString());
          cb();
        },
        writev(chunks, cb) {
          calls.push(chunks.map((c) => c.chunk.toString()).join("+"));
          cb();
        },
      });
      w.cork();
      w.write("a");
      w.write("b");
      equal(calls, []);
      w.uncork();
      w.end();
      await s.promises.finished(w);
      equal(calls, ["a+b"]);
    },
    async transform(s) {
      const t = new s.Transform({
        objectMode: true,
        transform(c, _e, cb) {
          cb(null, c * 2);
        },
        flush(cb) {
          this.push(9);
          cb();
        },
      });
      const values = collect(t);
      t.write(2);
      t.end(3);
      equal(await values, [4, 6, 9]);
    },
    async pipeline(s) {
      const values: number[] = [];
      const t = new s.Transform({
        objectMode: true,
        transform(c, _e, cb) {
          cb(null, c + 1);
        },
      });
      const w = new s.Writable({
        objectMode: true,
        write(c, _e, cb) {
          values.push(c);
          cb();
        },
      });
      await s.promises.pipeline(s.Readable.from([1, 2]), t, w);
      equal(values, [2, 3]);
      check(w.writableFinished);
    },
    async pipelineError(s) {
      const error = new Error("sink");
      const r = s.Readable.from([1, 2]);
      const w = new s.Writable({
        objectMode: true,
        write(_c, _e, cb) {
          cb(error);
        },
      });
      try {
        await s.promises.pipeline(r, w);
        throw Error("Expected rejection");
      } catch (e) {
        check(e === error);
      }
      check(r.destroyed && w.destroyed);
    },
    async finished(s) {
      const r = s.Readable.from([1]);
      let called = false;
      const done = new Promise<void>((resolve, reject) => {
        s.finished(r, (e) => {
          called = true;
          e ? reject(e) : resolve();
        });
      });
      check(!called);
      r.resume();
      await done;
      check(called);
    },
    async abort(s) {
      const controller = new AbortController(),
        reason = new Error("stop");
      const r = new s.Readable({ read() {} });
      const done = new Promise<Error>((resolve) => r.once("error", resolve));
      check(s.addAbortSignal(controller.signal, r) === r);
      controller.abort(reason);
      const error = await done;
      equal(error.name, "AbortError");
      check(error.cause === reason);
      check(r.destroyed);
    },
    async duplexPair(s) {
      const [a, b] = s.duplexPair({ objectMode: true });
      const values = collect(b);
      const back = collect(a);
      a.end("sent");
      b.end("back");
      equal(await values, ["sent"]);
      equal(await back, ["back"]);
    },
    async readableWeb(s) {
      const source = new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode("web"));
          c.close();
        },
      });
      const r = s.Readable.fromWeb(source as any);
      equal(
        new TextDecoder().decode((await collect(r))[0] as Uint8Array),
        "web",
      );
      const web = s.Readable.toWeb(s.Readable.from(["a", "b"]));
      const reader = web.getReader();
      equal((await reader.read()).value, "a");
      equal((await reader.read()).value, "b");
      check((await reader.read()).done);
      reader.releaseLock();
    },
    async writableWeb(s) {
      const values: string[] = [];
      const web = new WritableStream({
        write(c) {
          values.push(new TextDecoder().decode(c));
        },
      });
      const w = s.Writable.fromWeb(web as any);
      w.end("text");
      await s.promises.finished(w);
      equal(values, ["text"]);
      const target = new s.Writable({
        objectMode: true,
        write(c, _e, cb) {
          values.push(c);
          cb();
        },
      });
      const writer = s.Writable.toWeb(target).getWriter();
      await writer.write("other");
      await writer.close();
      writer.releaseLock();
      equal(values, ["text", "other"]);
    },
    async duplexWeb(s) {
      const transform = new TransformStream({
        transform(c, controller) {
          controller.enqueue(c);
        },
      });
      const duplex = s.Duplex.fromWeb(transform as any, { objectMode: true });
      const values = collect(duplex);
      duplex.end("duplex");
      equal(await values, ["duplex"]);
    },
    validation(s) {
      errorCode(() => s.setDefaultHighWaterMark(false, -1), "ERR_OUT_OF_RANGE");
      errorCode(
        () => new s.Readable({ highWaterMark: -1 }),
        "ERR_INVALID_ARG_VALUE",
      );
      errorCode(() => s.Readable.from(null as any), "ERR_INVALID_ARG_TYPE");
      errorCode(() => s.Readable.fromWeb({} as any), "ERR_INVALID_ARG_TYPE");
    },
    async destroy(s) {
      const r = new s.Readable({ read() {} }),
        reason = new Error("destroy");
      const done = new Promise<Error>((resolve) => r.once("error", resolve));
      s.destroy(r, reason);
      check((await done) === reason);
      check(s.isDestroyed(r));
      check(s.isErrored(r));
      check(!s.isReadable(r));
    },
  },
};
export class StreamImplementation extends FeatureImplementation<
  typeof streamFeature
> {
  constructor(private readonly value = streamApi) {
    super(streamFeature, {
      exports: { status: "supported" },
      inheritance: { status: "supported" },
      highWaterMarks: { status: "supported" },
      readable: { status: "supported" },
      readableEncoding: { status: "supported" },
      iteration: { status: "supported" },
      operators: { status: "supported" },
      reduce: { status: "supported" },
      writable: { status: "supported" },
      backpressure: { status: "supported" },
      cork: { status: "supported" },
      transform: { status: "supported" },
      pipeline: { status: "supported" },
      pipelineError: { status: "supported" },
      finished: { status: "supported" },
      abort: { status: "supported" },
      duplexPair: { status: "supported" },
      readableWeb: { status: "supported" },
      writableWeb: { status: "supported" },
      duplexWeb: { status: "supported" },
      validation: { status: "supported" },
      destroy: { status: "supported" },
      compose: { status: "supported" },
      pipelineCallback: { status: "supported" },
      bufferHelpers: { status: "supported" },
    });
  }
  create() {
    return this.value;
  }
}
