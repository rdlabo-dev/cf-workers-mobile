import { Buffer } from "node:buffer";
import { ERR_INVALID_ARG_TYPE, ERR_OUT_OF_RANGE } from "../net/errors.js";
export function validateInteger(
  value: unknown,
  name: string,
  min = Number.MIN_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER,
): asserts value is number {
  if (typeof value !== "number")
    throw new ERR_INVALID_ARG_TYPE(name, "number", value);
  if (!Number.isInteger(value))
    throw new ERR_OUT_OF_RANGE(name, "an integer", value);
  if (value < min || value > max)
    throw new ERR_OUT_OF_RANGE(name, `>= ${min} && <= ${max}`, value);
}
export function isAnyBuffer(value: unknown): value is ArrayBuffer {
  try {
    Reflect.getOwnPropertyDescriptor(
      ArrayBuffer.prototype,
      "byteLength",
    )!.get!.call(value);
    return true;
  } catch {}
  if (typeof SharedArrayBuffer !== "undefined")
    try {
      Reflect.getOwnPropertyDescriptor(
        SharedArrayBuffer.prototype,
        "byteLength",
      )!.get!.call(value);
      return true;
    } catch {}
  return false;
}
export function bytes(value: unknown, name: string): Buffer {
  if (typeof value === "string") return Buffer.from(value);
  if (isAnyBuffer(value)) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(viewBytes(value));
  throw new ERR_INVALID_ARG_TYPE(
    name,
    ["string", "ArrayBuffer", "Buffer", "TypedArray", "DataView"],
    value,
  );
}

// Native Workers crypto entry points use signed 32-bit buffer lengths.
export function validateCryptoLength(length: number, message: string): void {
  if (length > 0x7fffffff) throw new RangeError(message);
}

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayBuffer = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "buffer",
)!.get!;
const typedArrayOffset = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteOffset",
)!.get!;
const typedArrayLength = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteLength",
)!.get!;
const dataViewBuffer = Object.getOwnPropertyDescriptor(
  DataView.prototype,
  "buffer",
)!.get!;
const dataViewOffset = Object.getOwnPropertyDescriptor(
  DataView.prototype,
  "byteOffset",
)!.get!;
const dataViewLength = Object.getOwnPropertyDescriptor(
  DataView.prototype,
  "byteLength",
)!.get!;
/** Read the intrinsic view extent, ignoring shadowed user properties. */
export function viewBytes(value: ArrayBufferView): Uint8Array {
  let buffer: ArrayBufferLike;
  try {
    buffer = typedArrayBuffer.call(value);
  } catch {
    buffer = dataViewBuffer.call(value);
    try {
      return new Uint8Array(
        buffer,
        dataViewOffset.call(value),
        dataViewLength.call(value),
      );
    } catch {
      return new Uint8Array(0);
    }
  }
  try {
    return new Uint8Array(
      buffer,
      typedArrayOffset.call(value),
      typedArrayLength.call(value),
    );
  } catch {
    return new Uint8Array(0);
  }
}
