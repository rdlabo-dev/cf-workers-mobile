import { Buffer } from "node:buffer";
import { Transform } from "node:stream";
import { NativeCodec, type Kind } from "./native-codecs.js";
import { validateFunction, validateObject } from "../net/validators.js";
import { validateInteger } from "../crypto/validation.js";
import { ERR_INVALID_ARG_TYPE, ERR_OUT_OF_RANGE } from "../net/errors.js";
const flushMarker = Symbol("codec flush");
function bytes(value: unknown): Uint8Array {
  if (typeof value === "string") return Buffer.from(value);
  if (ArrayBuffer.isView(value))
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new ERR_INVALID_ARG_TYPE(
    "buffer",
    ["string", "Buffer", "TypedArray", "DataView", "ArrayBuffer"],
    value,
  );
}
// Pinned workerd validators: NaN selects defaults; finite fractional values
// are accepted here and converted by the underlying buffer/codec operation.
function finite(value: unknown, name: string): value is number {
  if (value === undefined || Number.isNaN(value)) return false;
  if (typeof value !== "number")
    throw new ERR_INVALID_ARG_TYPE(name, "number", value);
  if (!Number.isFinite(value))
    throw new ERR_OUT_OF_RANGE(name, "a finite number", value);
  return true;
}
function range(
  value: unknown,
  name: string,
  low: number,
  high: number,
  fallback: number,
): number {
  if (!finite(value, name)) return fallback;
  if (value < low || value > high)
    throw new ERR_OUT_OF_RANGE(name, `>= ${low} and <= ${high}`, value);
  return value;
}
function settings(kind: Kind, encode: boolean, value: any = {}) {
  if (value == null) value = {};
  validateObject(value, "options");
  const chunkSize = finite(value.chunkSize, "options.chunkSize")
    ? value.chunkSize
    : 16384;
  if (chunkSize < 64)
    throw new ERR_OUT_OF_RANGE("options.chunkSize", ">= 64", chunkSize);
  const maxOutputLength = range(
    value.maxOutputLength,
    "options.maxOutputLength",
    1,
    2147483647,
    2147483647,
  );
  const params = value.params ?? {};
  validateObject(params, "options.params");
  const maximum = kind === "brotli" ? 8 : encode ? 402 : 100;
  const seen = new Set<number>();
  for (const [key, val] of Object.entries(params)) {
    const number = Number(key);
    if (
      !Number.isInteger(number) ||
      number < 0 ||
      number > maximum ||
      seen.has(number)
    )
      throw Object.assign(
        new RangeError(
          `${key} is not a valid ${kind === "brotli" ? "Brotli" : "Zstd"} parameter`,
        ),
        {
          code:
            kind === "brotli"
              ? "ERR_BROTLI_INVALID_PARAM"
              : "ERR_ZSTD_INVALID_PARAM",
        },
      );
    seen.add(number);
    if (typeof val !== "number" && typeof val !== "boolean")
      throw new ERR_INVALID_ARG_TYPE("options.params[key]", "number", val);
  }
  const flush = range(
    value.flush,
    "options.flush",
    0,
    kind === "brotli" ? 3 : 2,
    0,
  );
  const finishFlush = range(
    value.finishFlush,
    "options.finishFlush",
    0,
    kind === "brotli" ? 3 : 2,
    2,
  );
  if (value.pledgedSrcSize !== undefined)
    validateInteger(
      value.pledgedSrcSize,
      "options.pledgedSrcSize",
      0,
      0xffffffff,
    );
  return {
    chunkSize,
    maxOutputLength,
    params,
    flush,
    finishFlush,
    pledged: value.pledgedSrcSize,
    info: !!value.info,
  };
}
class CodecTransform extends Transform {
  private codec: NativeCodec;
  private readonly config: ReturnType<typeof settings>;
  bytesWritten = 0;
  private readonly kind: Kind;
  private readonly encode: boolean;
  constructor(kind: Kind, encode: boolean, options?: any) {
    const config = settings(kind, encode, options);
    super(options ?? {});
    this.kind = kind;
    this.encode = encode;
    this.config = config;
    this.codec = new NativeCodec(
      kind,
      encode,
      config.chunkSize,
      config.params,
      config.pledged,
    );
  }
  _transform(input: any, _encoding: any, callback: any) {
    try {
      const operation = input[flushMarker] ?? this.config.flush;
      this.codec.process(bytes(input), operation, (output) =>
        this.push(Buffer.from(output)),
      );
      this.bytesWritten = this.codec.consumed;
      callback();
    } catch (error) {
      callback(error);
    }
  }
  _flush(callback: any) {
    try {
      this.codec.process(new Uint8Array(), this.config.finishFlush, (output) =>
        this.push(Buffer.from(output)),
      );
      this.bytesWritten = this.codec.consumed;
      callback();
    } catch (error) {
      callback(error);
    }
  }
  _destroy(error: any, callback: any) {
    this.codec.close();
    callback(error);
  }
  flush(kind?: number | (() => void), callback?: () => void) {
    if (typeof kind === "function") {
      callback = kind;
      kind = 1;
    }
    kind ??= 1;
    validateInteger(kind, "kind", 0, this.kind === "brotli" ? 3 : 2);
    if (callback !== undefined) validateFunction(callback, "callback");
    if (this.writableFinished) {
      if (callback) queueMicrotask(callback);
      return;
    }
    const marker: any = Buffer.alloc(0);
    marker[flushMarker] = kind;
    this.write(marker, callback);
  }
  reset() {
    if (this.destroyed) throw new Error("Codec is closed");
    this.codec.close();
    this.codec = new NativeCodec(
      this.kind,
      this.encode,
      this.config.chunkSize,
      this.config.params,
      this.config.pledged,
    );
    this.bytesWritten = 0;
  }
  close(callback?: () => void) {
    if (callback) {
      validateFunction(callback, "callback");
      this.once("close", callback);
    }
    this.destroy();
  }
  _processChunk(input: unknown, operation = 2) {
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      this.codec.process(bytes(input), operation, (output) => {
        length += output.length;
        if (length > this.config.maxOutputLength)
          throw Object.assign(
            new RangeError(
              "Cannot create a Buffer larger than maxOutputLength",
            ),
            { code: "ERR_BUFFER_TOO_LARGE" },
          );
        chunks.push(output);
      });
      this.bytesWritten = this.codec.consumed;
      return Buffer.concat(chunks, length);
    } finally {
      this.codec.close();
    }
  }
}
export class BrotliCompress extends CodecTransform {
  constructor(options?: any) {
    super("brotli", true, options);
  }
}
export class BrotliDecompress extends CodecTransform {
  constructor(options?: any) {
    super("brotli", false, options);
  }
}
export class ZstdCompress extends CodecTransform {
  constructor(options?: any) {
    super("zstd", true, options);
  }
}
export class ZstdDecompress extends CodecTransform {
  constructor(options?: any) {
    super("zstd", false, options);
  }
}
export const createBrotliCompress = (options?: any) =>
  new BrotliCompress(options);
export const createBrotliDecompress = (options?: any) =>
  new BrotliDecompress(options);
export const createZstdCompress = (options?: any) => new ZstdCompress(options);
export const createZstdDecompress = (options?: any) =>
  new ZstdDecompress(options);
function sync(kind: Kind, encode: boolean, input: unknown, options?: any) {
  const data = bytes(input),
    config = settings(kind, encode, options);
  if (config.info) {
    const Constructor =
      kind === "brotli"
        ? encode
          ? BrotliCompress
          : BrotliDecompress
        : encode
          ? ZstdCompress
          : ZstdDecompress;
    const engine = new Constructor(options);
    return { buffer: engine._processChunk(data, config.finishFlush), engine };
  }
  const codec = new NativeCodec(
    kind,
    encode,
    config.chunkSize,
    config.params,
    config.pledged ?? (encode && kind === "zstd" ? data.length : undefined),
  );
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    codec.process(data, config.finishFlush, (output) => {
      length += output.length;
      if (length > config.maxOutputLength)
        throw new RangeError("Memory limit exceeded");
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
function asyncOperation(
  kind: Kind,
  encode: boolean,
  input: unknown,
  options: any,
  callback?: any,
) {
  if (typeof options === "function") {
    callback = options;
    options = undefined;
  }
  validateFunction(callback, "callback");
  const data = bytes(input);
  settings(kind, encode, options);
  new Promise((resolve) => resolve(sync(kind, encode, data, options))).then(
    (result) => callback(null, result),
    (error) => callback(error),
  );
}
export function brotliCompressSync(input: unknown, options?: any) {
  return sync("brotli", true, input, options);
}
export function brotliDecompressSync(input: unknown, options?: any) {
  return sync("brotli", false, input, options);
}
export function zstdCompressSync(input: unknown, options?: any) {
  return sync("zstd", true, input, options);
}
export function zstdDecompressSync(input: unknown, options?: any) {
  return sync("zstd", false, input, options);
}
export function brotliCompress(input: unknown, options?: any, callback?: any) {
  asyncOperation("brotli", true, input, options, callback);
}
export function brotliDecompress(
  input: unknown,
  options?: any,
  callback?: any,
) {
  asyncOperation("brotli", false, input, options, callback);
}
export function zstdCompress(input: unknown, options?: any, callback?: any) {
  asyncOperation("zstd", true, input, options, callback);
}
export function zstdDecompress(input: unknown, options?: any, callback?: any) {
  asyncOperation("zstd", false, input, options, callback);
}
