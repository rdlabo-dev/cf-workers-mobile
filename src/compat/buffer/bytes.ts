import { isUint8Array } from "./support.js";
/** Web implementation of workerd's internal Buffer byte operations. */
export type Encoding =
  | "utf8"
  | "utf16le"
  | "ascii"
  | "latin1"
  | "hex"
  | "base64"
  | "base64url";
const encoder = new TextEncoder();
const utf8 = new TextDecoder("utf-8", { ignoreBOM: true });
const strictUtf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
const getBuffer = Object.getOwnPropertyDescriptor(typedArray, "buffer")!.get!;
const getOffset = Object.getOwnPropertyDescriptor(
  typedArray,
  "byteOffset",
)!.get!;
const getLength = Object.getOwnPropertyDescriptor(
  typedArray,
  "byteLength",
)!.get!;
function view(value: ArrayBufferView): Uint8Array<ArrayBufferLike> {
  if (!isUint8Array(value)) throw new TypeError("Expected Uint8Array");
  return new Uint8Array(
    getBuffer.call(value),
    getOffset.call(value),
    getLength.call(value),
  );
}
function units(bytes: Uint8Array, width: 1 | 2, mask = 255) {
  let result = "";
  for (let i = 0; i + width <= bytes.length; i += width)
    result += String.fromCharCode(
      width === 2 ? bytes[i] | (bytes[i + 1] << 8) : bytes[i] & mask,
    );
  return result;
}
function decodeString(
  text: string,
  encoding: Encoding,
  strict = false,
): Uint8Array<ArrayBuffer> {
  if (encoding === "utf8") return encoder.encode(text);
  if (encoding === "utf16le") {
    const bytes = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i++) {
      bytes[i * 2] = text.charCodeAt(i);
      bytes[i * 2 + 1] = text.charCodeAt(i) >>> 8;
    }
    return bytes;
  }
  // The native binding converts strings to one-byte code units before parsing.
  const latin = Uint8Array.from({ length: text.length }, (_, i) =>
    text.charCodeAt(i),
  );
  if (encoding === "ascii" || encoding === "latin1") return latin;
  text = units(latin, 1);
  if (encoding === "hex") {
    if (strict && (text.length % 2 || /[^0-9a-f]/i.test(text)))
      throw new TypeError("The text is not valid hex");
    const pairs = text.match(/^(?:[0-9a-f]{2})*/i)![0];
    return Uint8Array.from({ length: pairs.length / 2 }, (_, i) =>
      parseInt(pairs.slice(i * 2, i * 2 + 2), 16),
    );
  }
  text = text
    .split("=")[0]
    .replace(/[^a-zA-Z0-9+/_-]/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  if (text.length % 4 === 1) text = text.slice(0, -1);
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
function toString(
  bytes: Uint8Array,
  start: number,
  end: number,
  encoding: Encoding,
): string {
  bytes = view(bytes);
  bytes = new Uint8Array(
    bytes.buffer,
    bytes.byteOffset + start,
    Math.max(0, Math.min(bytes.length, end) - start),
  );
  if (encoding === "utf8") return utf8.decode(bytes);
  if (encoding === "utf16le") return units(bytes, 2);
  if (encoding === "ascii") return units(bytes, 1, 127);
  if (encoding === "latin1") return units(bytes, 1);
  if (encoding === "hex")
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const encoded = btoa(units(bytes, 1));
  return encoding === "base64url"
    ? encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    : encoded;
}
function write(
  bytes: Uint8Array,
  text: string,
  offset: number,
  length: number,
  encoding: Encoding,
) {
  bytes = view(bytes);
  const target = new Uint8Array(
    bytes.buffer,
    bytes.byteOffset + offset,
    Math.min(length, bytes.length - offset),
  );
  if (encoding === "utf8") return encoder.encodeInto(text, target).written;
  // Native write parses base64 from UTF-8 bytes; from() first truncates
  // UTF-16 code units to Latin1. These paths differ for non-ASCII input.
  const decoded = decodeString(
    encoding === "base64" || encoding === "base64url"
      ? units(encoder.encode(text), 1)
      : text,
    encoding,
  );
  let count = Math.min(target.length, decoded.length);
  if (encoding === "utf16le") count &= ~1;
  target.set(decoded.subarray(0, count));
  return count;
}
function indexOf(
  bytes: Uint8Array,
  value: Uint8Array | string,
  offset: number,
  encoding: Encoding,
  forward: boolean,
) {
  bytes = view(bytes);
  const needle =
    typeof value === "string" ? decodeString(value, encoding) : view(value);
  const wide = encoding === "utf16le";
  const size = wide ? bytes.length & ~1 : bytes.length;
  if (offset < 0)
    offset =
      offset + size >= 0 ? offset + size : forward || !needle.length ? 0 : -1;
  else if (offset + needle.length > size)
    offset = !needle.length ? size : forward ? -1 : size - 1;
  if (!needle.length) return offset;
  if (
    offset < 0 ||
    needle.length > size ||
    (forward && offset + needle.length > size)
  )
    return -1;
  if (wide && (size < 2 || needle.length < 2)) return -1;
  const width = wide ? 2 : 1,
    count = wide ? needle.length & ~1 : needle.length;
  if (wide) offset = Math.floor(offset / 2) * 2;
  for (let i = offset; i >= 0 && i < size; i += forward ? width : -width) {
    if (i + count > size) continue;
    let matched = true;
    for (let j = 0; j < count; j++)
      if (bytes[i + j] !== needle[j]) {
        matched = false;
        break;
      }
    if (matched) return i;
  }
  return -1;
}
function transcode(source: ArrayBufferView, from: Encoding, to: Encoding) {
  if (
    !["utf8", "utf16le", "ascii", "latin1"].includes(from) ||
    !["utf8", "utf16le", "ascii", "latin1"].includes(to)
  )
    throw new Error("Unable to transcode buffer due to unsupported encoding");
  const bytes = view(source);
  let text: string;
  if (from === "utf8") {
    if (to === "utf16le") {
      try {
        text = strictUtf8.decode(bytes);
      } catch {
        throw new Error("Unable to transcode buffer");
      }
    } else text = utf8.decode(bytes);
    if (to === "latin1" || to === "ascii") text = text.replace(/\uFEFF/g, "");
  } else if (from === "utf16le") {
    if (bytes.length % 2 && to !== "utf16le")
      throw new Error("UTF-16le input size should be multiple of 2");
    text = units(bytes, 2);
    if (
      to === "utf8" &&
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
        text,
      )
    )
      throw new Error("Expected UTF8 length mismatch");
    if (bytes.length % 2) text += "\ufffd";
    if (to === "utf16le") text = utf8.decode(encoder.encode(text));
  } else text = units(bytes, 1);
  if (to === "utf8" || to === "utf16le") return decodeString(text, to);
  text = text.replace(/\uFEFF/g, "");
  const limit = 255; // Pinned workerd converter maps ASCII through its Latin1 codec.
  return Uint8Array.from(
    Array.from(text).filter(
      (char) =>
        char.codePointAt(0)! <= limit ||
        !/\p{Default_Ignorable_Code_Point}/u.test(char),
    ),
    (char) => (char.codePointAt(0)! <= limit ? char.charCodeAt(0) : 63),
  );
}
export default {
  UTF8: "utf8",
  UTF16LE: "utf16le",
  ASCII: "ascii",
  LATIN1: "latin1",
  HEX: "hex",
  BASE64: "base64",
  BASE64URL: "base64url",
  decodeString,
  toString,
  write,
  indexOf,
  transcode,
  byteLength: (text: string) => encoder.encode(text).length,
  compare(
    a: Uint8Array,
    b: Uint8Array,
    options: {
      aStart?: number;
      aEnd?: number;
      bStart?: number;
      bEnd?: number;
    } = {},
  ) {
    a = view(a);
    b = view(b);
    a = Uint8Array.prototype.subarray.call(a, options.aStart, options.aEnd);
    b = Uint8Array.prototype.subarray.call(b, options.bStart, options.bEnd);
    for (let i = 0; i < Math.min(a.length, b.length); i++)
      if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
    return Math.sign(a.length - b.length);
  },
  concat(list: Uint8Array[], length: number) {
    const values: Uint8Array[] = [];
    for (let i = 0; i < list.length; i++) values.push(view(list[i]));
    list = values;
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const item of list) {
      const count = Math.min(item.length, length - offset);
      bytes.set(item.subarray(0, count), offset);
      offset += count;
    }
    return bytes;
  },
  swap(bytes: Uint8Array, bits: number) {
    bytes = view(bytes);
    const width = bits / 8;
    for (let i = 0; i < bytes.length; i += width)
      for (let j = 0; j < width / 2; j++)
        [bytes[i + j], bytes[i + width - j - 1]] = [
          bytes[i + width - j - 1],
          bytes[i + j],
        ];
  },
  fillImpl(
    bytes: Uint8Array,
    value: string | ArrayBufferView,
    start: number,
    end: number,
    encoding: Encoding = "utf8",
  ) {
    bytes = view(bytes);
    const pattern =
      typeof value === "string"
        ? decodeString(value, encoding, true)
        : view(value).slice();
    for (let i = start; i < end; i++)
      bytes[i] = pattern.length ? pattern[(i - start) % pattern.length] : 0;
  },
  isAscii: (value: ArrayBufferView) => view(value).every((byte) => byte < 128),
  isUtf8(value: ArrayBufferView) {
    const bytes = view(value);
    try {
      strictUtf8.decode(bytes);
      return true;
    } catch {
      return false;
    }
  },
} satisfies Record<string, unknown> & {
  UTF8: Encoding;
  UTF16LE: Encoding;
  ASCII: Encoding;
  LATIN1: Encoding;
  HEX: Encoding;
  BASE64: Encoding;
  BASE64URL: Encoding;
};
