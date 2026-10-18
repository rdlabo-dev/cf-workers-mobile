import { ERR_INVALID_ARG_TYPE } from "./errors.js";
import type { Encoding } from "./bytes.js";
const arrayBufferLength = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength",
)!.get!;
export function isAnyArrayBuffer(value: unknown): value is ArrayBuffer {
  try {
    arrayBufferLength.call(value);
    return true;
  } catch {}
  if (typeof SharedArrayBuffer !== "undefined") {
    try {
      Object.getOwnPropertyDescriptor(
        SharedArrayBuffer.prototype,
        "byteLength",
      )!.get!.call(value);
      return true;
    } catch {}
  }
  return false;
}
export const isArrayBufferView = ArrayBuffer.isView;
const typedArrayTag = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  Symbol.toStringTag,
)!.get!;
export function isUint8Array(value: unknown): value is Uint8Array {
  return typedArrayTag.call(value) === "Uint8Array";
}
export function validateString(
  value: unknown,
  name: string,
): asserts value is string {
  if (typeof value !== "string")
    throw new ERR_INVALID_ARG_TYPE(name, "string", value);
}
export function normalizeEncoding(value?: string): Encoding | undefined {
  return value == null ? "utf8" : getEncodingOps(value);
}
export function getEncodingOps(value: unknown): Encoding | undefined {
  if (value === undefined) return "utf8";
  switch (`${value}`.toLowerCase()) {
    case "":
    case "utf8":
    case "utf-8":
      return "utf8";
    case "ucs2":
    case "ucs-2":
    case "utf16le":
    case "utf-16le":
      return "utf16le";
    case "latin1":
    case "binary":
      return "latin1";
    case "ascii":
      return "ascii";
    case "hex":
      return "hex";
    case "base64":
      return "base64";
    case "base64url":
      return "base64url";
  }
}
export default {
  ALL_PROPERTIES: 0,
  ONLY_ENUMERABLE: 2,
  getOwnNonIndexProperties(value: object, filter: number) {
    return Reflect.ownKeys(value).filter(
      (key) =>
        !(
          typeof key === "string" &&
          /^(0|[1-9]\d*)$/.test(key) &&
          Number(key) < 4294967295
        ) &&
        (!filter || Object.getOwnPropertyDescriptor(value, key)!.enumerable),
    );
  },
};
