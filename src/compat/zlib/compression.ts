import { Buffer } from "node:buffer";
import { NativeCodec, type Kind } from "./native-codecs.js";
import { ERR_INVALID_ARG_TYPE } from "../net/errors.js";
import {
  Brotli,
  Zstd,
  zstdInitCParamsArray,
  zstdInitDParamsArray,
  kMaxZstdCParam,
  kMaxZstdDParam,
} from "./classic-base.cjs";
export class BrotliCompress extends Brotli {
  constructor(options?: any) {
    super(options, 9);
  }
}
export class BrotliDecompress extends Brotli {
  constructor(options?: any) {
    super(options, 8);
  }
}
export class ZstdCompress extends Zstd {
  constructor(options?: any) {
    super(options, 10, zstdInitCParamsArray, kMaxZstdCParam);
  }
}
export class ZstdDecompress extends Zstd {
  constructor(options?: any) {
    super(options, 11, zstdInitDParamsArray, kMaxZstdDParam);
  }
}
export const createBrotliCompress = (options?: any) =>
  new BrotliCompress(options);
export const createBrotliDecompress = (options?: any) =>
  new BrotliDecompress(options);
export const createZstdCompress = (options?: any) => new ZstdCompress(options);
export const createZstdDecompress = (options?: any) =>
  new ZstdDecompress(options);

function bytes(value: unknown): Uint8Array {
  if (typeof value === "string") return Buffer.from(value);
  if (ArrayBuffer.isView(value))
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new TypeError(
    "Input must be a string or ArrayBuffer or ArrayBufferView",
  );
}
function integer(value: unknown, fallback: number, unsigned = true) {
  if (value === undefined) return fallback;
  const number = Number(value);
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
function pledged(value: any) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number >= 18446744073709551616)
    throw new TypeError(
      "The value cannot be converted because it is not an integer.",
    );
  return Math.trunc(number);
}
function convert(options: any) {
  if (!options || typeof options !== "object")
    throw new TypeError("Options must be an object");
  if (
    options.params !== undefined &&
    (!options.params || typeof options.params !== "object")
  )
    throw new TypeError(
      "Incorrect type for the 'params' field on 'Options': the provided value is not of type 'object'.",
    );
  const params = Object.fromEntries(
    Object.entries(options.params ?? {}).map(([key, value]) => [
      key,
      Number(value) | 0,
    ]),
  );
  return {
    chunkSize: integer(options.chunkSize, 16384),
    maxOutputLength: integer(options.maxOutputLength, 134217728),
    flush: integer(options.flush, 0, false),
    finishFlush: integer(options.finishFlush, 2, false),
    params,
    pledged: pledged(options.pledgedSrcSize),
  };
}
function bounded(value: number, name: string, min: number, max: number) {
  if (value < min || value > max)
    throw new RangeError(
      `The value of "options.${name}" is out of range. It must be >= ${min} and <= ${max}. Received ${value}`,
    );
}
function fast(
  kind: Kind,
  encode: boolean,
  data: Uint8Array,
  config: ReturnType<typeof convert>,
) {
  bounded(config.chunkSize, "chunkSize", 64, 134217728);
  bounded(config.maxOutputLength, "maxOutputLength", 1, 134217728);
  for (const key of Object.keys(config.params))
    if (!/^[+-]?\d+$/.test(key)) throw new Error("Invalid parameter name");
  const codec = new NativeCodec(
    kind,
    encode,
    Math.min(16384, config.maxOutputLength),
    config.params,
    config.pledged ?? (encode && kind === "zstd" ? data.length : undefined),
  );
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    bounded(config.flush, "flush", 0, kind === "brotli" ? 3 : 2);
    bounded(config.finishFlush, "finishFlush", 0, kind === "brotli" ? 3 : 2);
    codec.process(data, config.finishFlush, (output) => {
      length += output.length;
      if (length > config.maxOutputLength)
        throw kind === "zstd" && encode
          ? new Error("Unexpected end of file")
          : new RangeError("Memory limit exceeded");
      chunks.push(output);
    });
    return Buffer.concat(chunks, length);
  } catch (error) {
    if (
      error instanceof RangeError ||
      (error instanceof Error && error.message === "Unexpected end of file")
    )
      throw error;
    throw new Error("Compression failed");
  } finally {
    codec.close();
  }
}
function engine(kind: Kind, encode: boolean, options: any) {
  return new (
    kind === "brotli"
      ? encode
        ? BrotliCompress
        : BrotliDecompress
      : encode
        ? ZstdCompress
        : ZstdDecompress
  )(options);
}
function sync(kind: Kind, encode: boolean, input: unknown, options: any = {}) {
  if (options.info) {
    const instance = engine(kind, encode, options);
    return {
      buffer: instance._processChunk(
        typeof input === "string"
          ? Buffer.from(input)
          : (input as ArrayBufferView),
        instance._finishFlushFlag,
      ),
      engine: instance,
    };
  }
  return fast(kind, encode, bytes(input), convert(options));
}
function asyncOperation(
  kind: Kind,
  encode: boolean,
  input: unknown,
  options: any,
  callback?: any,
) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  if (typeof callback !== "function")
    throw new ERR_INVALID_ARG_TYPE("callback", "Function", callback);
  let run: () => unknown;
  if (options.info) {
    const instance = engine(kind, encode, options);
    run = () => ({
      buffer: instance._processChunk(
        typeof input === "string"
          ? Buffer.from(input)
          : (input as ArrayBufferView),
        instance._finishFlushFlag,
      ),
      engine: instance,
    });
  } else {
    const data = bytes(input),
      config = convert(options);
    run = () => fast(kind, encode, data, config);
  }
  let result: unknown, error: unknown;
  try {
    result = run();
  } catch (failure) {
    error = failure;
  }
  queueMicrotask(() => (error ? callback(error) : callback(null, result)));
}
export const brotliCompressSync = (input: unknown, options?: any) =>
  sync("brotli", true, input, options);
export const brotliDecompressSync = (input: unknown, options?: any) =>
  sync("brotli", false, input, options);
export const zstdCompressSync = (input: unknown, options?: any) =>
  sync("zstd", true, input, options);
export const zstdDecompressSync = (input: unknown, options?: any) =>
  sync("zstd", false, input, options);
export const brotliCompress = (input: unknown, options?: any, callback?: any) =>
  asyncOperation("brotli", true, input, options, callback);
export const brotliDecompress = (
  input: unknown,
  options?: any,
  callback?: any,
) => asyncOperation("brotli", false, input, options, callback);
export const zstdCompress = (input: unknown, options?: any, callback?: any) =>
  asyncOperation("zstd", true, input, options, callback);
export const zstdDecompress = (input: unknown, options?: any, callback?: any) =>
  asyncOperation("zstd", false, input, options, callback);
