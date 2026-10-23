import { nativeNumber } from "./input.js";
import {
  viewBytes,
  isAnyBuffer,
  bufferBytes,
} from "../../shared/buffer-source.js";
import { Buffer } from "node:buffer";
import { Zlib } from "./classic-base.cjs";
import { ZlibStream } from "./classic-binding.js";
import { ERR_INVALID_ARG_TYPE } from "../net/errors.js";
export class Deflate extends Zlib {
  constructor(options?: any) {
    super(options, 1);
  }
}
export class Inflate extends Zlib {
  constructor(options?: any) {
    super(options, 2);
  }
}
export class Gzip extends Zlib {
  constructor(options?: any) {
    super(options, 3);
  }
}
export class Gunzip extends Zlib {
  constructor(options?: any) {
    super(options, 4);
  }
}
export class DeflateRaw extends Zlib {
  constructor(options?: any) {
    if (options?.windowBits === 8) options.windowBits = 9;
    super(options, 5);
  }
}
export class InflateRaw extends Zlib {
  constructor(options?: any) {
    super(options, 6);
  }
}
export class Unzip extends Zlib {
  constructor(options?: any) {
    super(options, 7);
  }
}
const constructors = [
  Deflate,
  Inflate,
  Gzip,
  Gunzip,
  DeflateRaw,
  InflateRaw,
  Unzip,
];
export const createDeflate = (options?: any) => new Deflate(options);
export const createInflate = (options?: any) => new Inflate(options);
export const createGzip = (options?: any) => new Gzip(options);
export const createGunzip = (options?: any) => new Gunzip(options);
export const createDeflateRaw = (options?: any) => new DeflateRaw(options);
export const createInflateRaw = (options?: any) => new InflateRaw(options);
export const createUnzip = (options?: any) => new Unzip(options);
const maxChunk = 134217728;
function bytes(input: any, parameter = 1, method = "zlibSync"): Buffer {
  if (typeof input === "string") return Buffer.from(input);
  if (ArrayBuffer.isView(input)) return Buffer.from(viewBytes(input));
  if (isAnyBuffer(input)) return Buffer.from(bufferBytes(input));
  throw new TypeError(
    `Failed to execute '${method}' on 'ZlibUtil': parameter ${parameter} is not of type 'string or ArrayBuffer or ArrayBufferView'.`,
  );
}
function integer(value: any, fallback: number, unsigned = true) {
  if (value === undefined) return fallback;
  const number = nativeNumber(value);
  if (
    !Number.isFinite(number) ||
    number < (unsigned ? 0 : -2147483648) ||
    number > (unsigned ? 4294967295 : 2147483647)
  )
    throw new TypeError(
      "The value cannot be converted because it is not an integer.",
    );
  return Math.trunc(number);
}
function bounded(value: number, name: string, min: number, max: number) {
  if (value < min || value > max)
    throw new RangeError(
      `The value of "options.${name}" is out of range. It must be >= ${min} and <= ${max}. Received ${value}`,
    );
  return value;
}
function prepare(input: any, options: any, method = "zlibSync") {
  const data = bytes(input, 1, method);
  if (typeof options !== "object" || options === null)
    throw new TypeError(
      `Failed to execute '${method}' on 'ZlibUtil': parameter 2 is not of type 'Options'.`,
    );
  // Conversion precedes native validation, including otherwise unused flush.
  const opts = {
    flush: integer(options.flush, 0, false),
    finishFlush: integer(options.finishFlush, 4, false),
    chunkSize: integer(options.chunkSize, 16384),
    windowBits: integer(options.windowBits, 15),
    level: integer(options.level, -1, false),
    memLevel: integer(options.memLevel, 8),
    strategy: integer(options.strategy, 0),
    dictionary:
      options.dictionary === undefined ? undefined : bytes(options.dictionary),
    maxOutputLength: integer(options.maxOutputLength, maxChunk),
  };
  return { data, opts };
}
function fast(
  mode: number,
  data: Buffer,
  opts: ReturnType<typeof prepare>["opts"],
) {
  bounded(opts.chunkSize, "chunkSize", 64, maxChunk);
  bounded(opts.maxOutputLength, "maxOutputLength", 1, maxChunk);
  if (!(opts.windowBits === 0 && [2, 4, 7].includes(mode)))
    bounded(opts.windowBits, "windowBits", 8, 15);
  bounded(opts.level, "level", -1, 9);
  bounded(opts.memLevel, "memLevel", 1, 9);
  if (opts.strategy > 4) throw new Error("invalid strategy");
  if (mode === 3 && opts.windowBits === 8) throw new Error("Zlib error");
  bounded(opts.flush, "flush", 0, 6);
  bounded(opts.finishFlush, "finishFlush", 0, 6);
  const state = new Uint32Array(2),
    handle = new ZlibStream(mode),
    chunks: Buffer[] = [];
  let error: Error | undefined,
    offset = 0,
    length = 0;
  handle.initialize(
    opts.windowBits,
    opts.level,
    opts.memLevel,
    opts.strategy,
    state,
    () => {},
    opts.dictionary,
  );
  handle.setErrorHandler((_errno, _code, message) => {
    error = new Error(message);
  });
  try {
    for (;;) {
      const size = Math.min(16384, opts.maxOutputLength - length + 1);
      const output = Buffer.allocUnsafe(size);
      handle.writeSync(
        opts.finishFlush,
        data,
        offset,
        data.length - offset,
        output,
        0,
        size,
      );
      if (error) throw error;
      offset = data.length - state[1];
      const produced = size - state[0];
      length += produced;
      if (length > opts.maxOutputLength)
        throw new RangeError("Memory limit exceeded");
      if (produced) chunks.push(output.subarray(0, produced));
      if (state[0] > 0) break;
    }
    return Buffer.concat(chunks, length);
  } finally {
    handle.close();
  }
}
function sync(mode: number, input: any, options: any = {}) {
  if (options.info) {
    const engine = new constructors[mode - 1](options);
    return {
      buffer: engine._processChunk(
        typeof input === "string" ? Buffer.from(input) : input,
        engine._finishFlushFlag,
      ),
      engine,
    };
  }
  const { data, opts } = prepare(input, options);
  return fast(mode, data, opts);
}
function callbackOperation(
  mode: number,
  input: any,
  options: any,
  callback?: any,
) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  if (typeof callback !== "function")
    throw new ERR_INVALID_ARG_TYPE("callback", "Function", callback);
  if (options.info) {
    const engine = new constructors[mode - 1](options);
    let result: any, error: unknown;
    try {
      result = {
        buffer: engine._processChunk(
          typeof input === "string" ? Buffer.from(input) : input,
          engine._finishFlushFlag,
        ),
        engine,
      };
    } catch (e) {
      error = e;
    }
    queueMicrotask(() => (error ? callback(error) : callback(null, result)));
    return;
  }
  const { data, opts } = prepare(input, options, "zlib");
  let result: Buffer | undefined, error: unknown;
  try {
    result = fast(mode, data, opts);
  } catch (e) {
    error = e;
  }
  queueMicrotask(() => (error ? callback(error) : callback(null, result)));
}
export const deflateSync = (input: any, options?: any) =>
  sync(1, input, options);
export const inflateSync = (input: any, options?: any) =>
  sync(2, input, options);
export const gzipSync = (input: any, options?: any) => sync(3, input, options);
export const gunzipSync = (input: any, options?: any) =>
  sync(4, input, options);
export const deflateRawSync = (input: any, options?: any) =>
  sync(5, input, options);
export const inflateRawSync = (input: any, options?: any) =>
  sync(6, input, options);
export const unzipSync = (input: any, options?: any) => sync(7, input, options);
export const deflate = (input: any, options: any, callback?: any) =>
  callbackOperation(1, input, options, callback);
export const inflate = (input: any, options: any, callback?: any) =>
  callbackOperation(2, input, options, callback);
export const gzip = (input: any, options: any, callback?: any) =>
  callbackOperation(3, input, options, callback);
export const gunzip = (input: any, options: any, callback?: any) =>
  callbackOperation(4, input, options, callback);
export const deflateRaw = (input: any, options: any, callback?: any) =>
  callbackOperation(5, input, options, callback);
export const inflateRaw = (input: any, options: any, callback?: any) =>
  callbackOperation(6, input, options, callback);
export const unzip = (input: any, options: any, callback?: any) =>
  callbackOperation(7, input, options, callback);
