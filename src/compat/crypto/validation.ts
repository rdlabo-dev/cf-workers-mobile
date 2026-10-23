import { viewBytes, isAnyBuffer } from "../../shared/buffer-source.js";
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

export { viewBytes, isAnyBuffer } from "../../shared/buffer-source.js";
