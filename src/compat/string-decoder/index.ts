// node:string_decoder compatibility unit.
//
// Reproduces the Workers shell semantics of workerd 1.20261012.1
// (src/node/internal/internal_stringdecoder.ts): a function constructor,
// prototype write/end/text methods, enumerable prototype getters for
// lastChar/lastNeed/lastTotal, and the Workers encoding normalization
// (null/undefined/'' all normalize to utf8). The utf8 core is implemented
// locally because Workers emits each invalid byte through its own
// WHATWG-style decoder (unlike the npm package's single-replacement
// flush); the other encodings delegate to the maintained `string_decoder`
// npm package, whose observable behavior matches workerd for
// utf16le/latin1/ascii/hex/base64.
// See LICENSE-3RD-PARTY.md for licenses.
import { Buffer } from "node:buffer";
import { StringDecoder as UpstreamStringDecoder } from "string_decoder/lib/string_decoder.js";

const classRegExp = /^([A-Z][a-z0-9]*)+$/;
const kTypes = [
  "string",
  "function",
  "number",
  "object",
  "Function",
  "Object",
  "boolean",
  "bigint",
  "symbol",
];

function inspect(input: unknown): string {
  if (typeof input === "string") return `'${input}'`;
  if (typeof input === "symbol") return String(input);
  if (typeof input === "object" && input !== null) {
    // Fixed rendering for constructor-less objects: never enumerates
    // properties and never invokes getters, so cyclic inputs and
    // side-effectful properties cannot fail or run user code here.
    if (Array.isArray(input)) return "[ Array ]";
    return Object.getPrototypeOf(input) === null
      ? "[Object: null prototype] {}"
      : "{}";
  }
  return `${input}`;
}

function createInvalidArgType(name: string, expected: string | string[]) {
  const expectedList = Array.isArray(expected) ? expected : [expected];
  let msg = "The ";
  if (name.endsWith(" argument")) {
    msg += `${name} `;
  } else {
    const type = name.includes(".") ? "property" : "argument";
    msg += `"${name}" ${type} `;
  }
  msg += "must be ";

  const types = [];
  const instances = [];
  const other = [];
  for (const value of expectedList) {
    if (kTypes.includes(value)) {
      types.push(value.toLocaleLowerCase());
    } else if (classRegExp.test(value)) {
      instances.push(value);
    } else {
      other.push(value);
    }
  }
  if (instances.length > 0) {
    const pos = types.indexOf("object");
    if (pos !== -1) {
      types.splice(pos, 1);
      instances.push("Object");
    }
  }
  if (types.length > 0) {
    if (types.length > 2) {
      const last = types.pop();
      msg += `one of type ${types.join(", ")}, or ${last}`;
    } else if (types.length === 2) {
      msg += `one of type ${types[0]} or ${types[1]}`;
    } else {
      msg += `of type ${types[0]}`;
    }
    if (instances.length > 0 || other.length > 0) {
      msg += " or ";
    }
  }
  if (instances.length > 0) {
    if (instances.length > 2) {
      const last = instances.pop();
      msg += `an instance of ${instances.join(", ")}, or ${last}`;
    } else {
      msg += `an instance of ${instances[0]}`;
      if (instances.length === 2) {
        msg += ` or ${instances[1]}`;
      }
    }
    if (other.length > 0) {
      msg += " or ";
    }
  }
  if (other.length > 0) {
    if (other.length > 2) {
      const last = other.pop();
      msg += `one of ${other.join(", ")}, or ${last}`;
    } else if (other.length === 2) {
      msg += `one of ${other[0]} or ${other[1]}`;
    } else {
      const first = other[0];
      if (first.toLowerCase() !== first) {
        msg += "an ";
      }
      msg += `${first}`;
    }
  }
  return msg;
}

function invalidArgTypeHelper(input: unknown): string {
  if (input == null) {
    return ` Received ${input}`;
  }
  if (typeof input === "function" && input.name) {
    return ` Received function ${input.name}`;
  }
  if (typeof input === "object") {
    const ctor = input.constructor as { name?: string } | undefined;
    if (ctor?.name) {
      return ` Received an instance of ${ctor.name}`;
    }
    return ` Received ${inspect(input)}`;
  }
  let inspected = inspect(input);
  if (inspected.length > 25) {
    inspected = `${inspected.slice(0, 25)}...`;
  }
  return ` Received type ${typeof input} (${inspected})`;
}

class ERR_INVALID_ARG_TYPE extends TypeError {
  code: string;
  constructor(name: string, expected: string | string[], actual: unknown) {
    super(
      `${createInvalidArgType(name, expected)}.${invalidArgTypeHelper(actual)}`,
    );
    this.code = "ERR_INVALID_ARG_TYPE";
  }
}

class ERR_INVALID_THIS extends TypeError {
  code: string;
  constructor(x: string) {
    super(`Value of "this" must be of type ${x}`);
    this.code = "ERR_INVALID_THIS";
  }
}

class ERR_UNKNOWN_ENCODING extends TypeError {
  code: string;
  constructor(x: unknown) {
    super(`Unknown encoding: ${x}`);
    this.code = "ERR_UNKNOWN_ENCODING";
  }
}

// The order of this array mirrors workerd's encoding enum.
const encodings = [
  "ascii",
  "latin1",
  "utf8",
  "utf16le",
  "base64",
  "base64url",
  "hex",
] as const;
type CanonicalEncoding = (typeof encodings)[number];

// workerd's getEncodingOps/normalizeEncoding: null, undefined and the
// empty string all normalize to utf8, unlike Node which throws for them.
function getEncodingOps(enc: unknown): CanonicalEncoding | undefined {
  if (enc === undefined) return "utf8";
  const encoding = `${enc}`;
  switch (encoding.length) {
    case 4:
      if (encoding === "UTF8") return "utf8";
      if (encoding === "ucs2" || encoding === "UCS2") return "utf16le";
      {
        const lowered = encoding.toLowerCase();
        if (lowered === "utf8") return "utf8";
        if (lowered === "ucs2") return "utf16le";
      }
      break;
    case 3:
      if (
        encoding === "hex" ||
        encoding === "HEX" ||
        encoding.toLowerCase() === "hex"
      ) {
        return "hex";
      }
      break;
    case 5:
      if (encoding === "ascii") return "ascii";
      if (encoding === "ucs-2") return "utf16le";
      if (encoding === "UTF-8") return "utf8";
      if (encoding === "ASCII") return "ascii";
      if (encoding === "UCS-2") return "utf16le";
      {
        const lowered = encoding.toLowerCase();
        if (lowered === "utf-8") return "utf8";
        if (lowered === "ascii") return "ascii";
        if (lowered === "ucs-2") return "utf16le";
      }
      break;
    case 6:
      if (encoding === "base64") return "base64";
      if (encoding === "latin1" || encoding === "binary") return "latin1";
      if (encoding === "BASE64") return "base64";
      if (encoding === "LATIN1" || encoding === "BINARY") return "latin1";
      {
        const lowered = encoding.toLowerCase();
        if (lowered === "base64") return "base64";
        if (lowered === "latin1" || lowered === "binary") return "latin1";
      }
      break;
    case 7:
      if (
        encoding === "utf16le" ||
        encoding === "UTF16LE" ||
        encoding.toLowerCase() === "utf16le"
      ) {
        return "utf16le";
      }
      break;
    case 8:
      if (
        encoding === "utf-16le" ||
        encoding === "UTF-16LE" ||
        encoding.toLowerCase() === "utf-16le"
      ) {
        return "utf16le";
      }
      break;
    case 9:
      if (
        encoding === "base64url" ||
        encoding === "BASE64URL" ||
        encoding.toLowerCase() === "base64url"
      ) {
        return "base64url";
      }
      break;
    default:
      if (encoding === "") return "utf8";
  }
  return undefined;
}

function normalizeEncoding(enc?: string): CanonicalEncoding | undefined {
  if (
    enc == null ||
    enc === "utf8" ||
    enc === "utf-8" ||
    enc === "UTF8" ||
    enc === "UTF-8"
  )
    return "utf8";
  return getEncodingOps(enc);
}

const kCore = Symbol("kCore");

// Decode engine behind the Workers shell. workerd keeps a 7-byte state
// buffer (4-byte incomplete-character window plus missing/buffered/encoding
// counters); lastNeed/lastTotal are the missing/total counters and lastChar
// is the window's first 4 bytes, which retain the last byte run even after
// the counters reset.
interface Core {
  lastChar: Uint8Array;
  lastNeed: number;
  lastTotal: number;
  write(buf: Uint8Array): string;
  end(): string;
  reset(): void;
}

// workerd flushes incomplete state per byte (WHATWG-style) and clears the
// counters on flush; the upstream package reports the same buffered bytes
// and counters during write, so only normalization is needed.
class UpstreamCore implements Core {
  readonly lastChar: Uint8Array = Buffer.alloc(4);
  #lastNeed = 0;
  #lastTotal = 0;
  constructor(
    private upstream: UpstreamStringDecoder,
    private transform: (value: string) => string,
  ) {
    // Give the upstream decoder the same 4-byte zero-initialized window
    // workerd exposes (the package sizes it per encoding and leaves it
    // absent for single-byte encodings).
    const state = upstream as unknown as {
      lastChar: Uint8Array;
      lastNeed: number;
      lastTotal: number;
    };
    state.lastChar = this.lastChar;
    state.lastNeed = 0;
    state.lastTotal = 0;
  }
  get lastNeed() {
    return this.#lastNeed;
  }
  get lastTotal() {
    return this.#lastTotal;
  }
  #sync() {
    const state = this.upstream as unknown as {
      lastNeed: number;
      lastTotal: number;
    };
    this.#lastNeed = state.lastNeed ?? 0;
    this.#lastTotal = this.#lastNeed === 0 ? 0 : (state.lastTotal ?? 0);
  }
  write(buf: Uint8Array) {
    const out = this.transform(this.upstream.write(buf));
    this.#sync();
    return out;
  }
  end() {
    const out = this.transform(this.upstream.end());
    // workerd clears the pending state entirely at end(); the upstream
    // package leaves its counters stale and would re-consume the dead
    // window bytes on the next write. The window contents stay visible.
    const state = this.upstream as unknown as {
      lastNeed: number;
      lastTotal: number;
    };
    state.lastNeed = 0;
    state.lastTotal = 0;
    this.#lastNeed = 0;
    this.#lastTotal = 0;
    return out;
  }
  reset() {
    const state = this.upstream as unknown as {
      lastNeed: number;
      lastTotal: number;
    };
    state.lastNeed = 0;
    state.lastTotal = 0;
    this.#lastNeed = 0;
    this.#lastTotal = 0;
  }
}

// UTF-8 uses Workers' own emission semantics: an incomplete valid sequence
// prefix is held, invalid bytes each produce a replacement character, and
// end() flushes the held bytes through the same per-byte decoding.
class Utf8Core implements Core {
  readonly lastChar = new Uint8Array(4);
  lastNeed = 0;
  lastTotal = 0;
  #decoder = new TextDecoder("utf-8", { ignoreBOM: true });

  // Returns the start and expected total length of the trailing
  // incomplete-but-valid UTF-8 prefix, or start -1 when the buffer ends
  // cleanly.
  static #pendingLength(buf: Uint8Array): { start: number; total: number } {
    const len = buf.length;
    for (let i = 0; i < 4 && i < len; i++) {
      const byte = buf[len - 1 - i];
      const kind = Utf8Core.#kind(byte);
      if (kind === -1) continue; // continuation byte
      if (kind === 0 || kind === -2) return { start: -1, total: 0 };
      // kind is the expected sequence length of a lead byte.
      return i + 1 < kind
        ? { start: len - 1 - i, total: kind }
        : { start: -1, total: 0 };
    }
    return { start: -1, total: 0 };
  }

  static #kind(byte: number) {
    if (byte <= 0x7f) return 0;
    if (byte >> 5 === 0x06) return 2;
    if (byte >> 4 === 0x0e) return 3;
    if (byte >> 3 === 0x1e) return 4;
    return byte >> 6 === 0x02 ? -1 : -2;
  }

  write(buf: Uint8Array) {
    if (buf.length === 0) return "";
    let out = "";
    let i = 0;
    // Continuation bytes consumed while a sequence is pending are appended
    // to the window; the bytes stay visible even after the counters reset.
    if (this.lastNeed > 0) {
      let buffered = this.lastTotal - this.lastNeed;
      while (i < buf.length && this.lastNeed > 0) {
        const byte = buf[i];
        if (Utf8Core.#kind(byte) !== -1) break;
        this.lastChar[buffered++] = byte;
        this.lastNeed--;
        i++;
      }
      if (this.lastNeed === 0) {
        // Sequence filled; emit it even when its bytes turn out invalid.
        out += this.#decoder.decode(this.lastChar.subarray(0, buffered));
        this.lastTotal = 0;
      } else if (i < buf.length) {
        // A non-continuation byte broke the sequence; flush the held bytes
        // through the same per-byte decoding Workers uses at end().
        out += this.#decoder.decode(this.lastChar.subarray(0, buffered));
        this.lastNeed = 0;
        this.lastTotal = 0;
      } else {
        return out;
      }
    }

    const rest = buf.subarray(i);
    const tail = Utf8Core.#pendingLength(rest);
    const emitLen = tail.start < 0 ? rest.length : tail.start;
    if (emitLen > 0) out += this.#decoder.decode(rest.subarray(0, emitLen));
    if (tail.start >= 0) {
      this.lastChar.fill(0);
      this.lastChar.set(rest.subarray(tail.start));
      this.lastTotal = tail.total;
      this.lastNeed = tail.total - (rest.length - tail.start);
    } else {
      this.lastNeed = 0;
      this.lastTotal = 0;
    }
    return out;
  }

  end() {
    const buffered = this.lastTotal - this.lastNeed;
    const out =
      buffered === 0
        ? ""
        : this.#decoder.decode(this.lastChar.subarray(0, buffered));
    this.lastNeed = 0;
    this.lastTotal = 0;
    return out;
  }

  reset() {
    this.lastNeed = 0;
    this.lastTotal = 0;
  }
}

interface DecoderState {
  encoding: string;
  lastChar: Uint8Array;
  lastNeed: number;
  lastTotal: number;
  write(buf: ArrayBufferView | DataView | string): string;
  end(buf?: ArrayBufferView | DataView | string): string;
  [kCore]?: Core;
}

function inner(decoder: DecoderState): Core {
  const core = decoder[kCore];
  if (core === undefined) {
    throw new ERR_INVALID_THIS("StringDecoder");
  }
  return core;
}

function toBuffer(input: Exclude<ArrayBufferView | string, string>) {
  if (ArrayBuffer.isView(input))
    return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  throw new ERR_INVALID_ARG_TYPE(
    "buf",
    ["Buffer", "TypedArray", "DataView", "string"],
    input,
  );
}

// @ts-expect-error TS2323 Cannot redeclare exported variable
export declare class StringDecoder {
  constructor(encoding?: string);

  encoding: string;
  readonly lastChar: Uint8Array;
  readonly lastNeed: number;
  readonly lastTotal: number;
  write(buf: ArrayBufferView | DataView | string): string;
  end(buf?: ArrayBufferView | DataView | string): string;
  text(buf: ArrayBufferView | DataView | string, offset?: number): string;
}

// The upstream package has no base64url mode; the URL-safe alphabet is the
// same output with '+'/'-' and '/'/'_' swapped and no '=' padding.
const base64urlOut = (value: string) =>
  value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// @ts-expect-error TS2323 Cannot redeclare exported variable
export function StringDecoder(
  this: DecoderState,
  encoding: string = "utf8",
): DecoderState {
  const normalizedEncoding = normalizeEncoding(encoding);
  if (normalizedEncoding === undefined) {
    throw new ERR_UNKNOWN_ENCODING(encoding);
  }
  this[kCore] =
    normalizedEncoding === "utf8"
      ? new Utf8Core()
      : new UpstreamCore(
          new UpstreamStringDecoder(
            normalizedEncoding === "base64url" ? "base64" : normalizedEncoding,
          ),
          normalizedEncoding === "base64url" ? base64urlOut : (v) => v,
        );
  this.encoding = normalizedEncoding;
  return this;
}

function write(
  this: DecoderState,
  buf: ArrayBufferView | DataView | string,
): string {
  const core = inner(this);
  if (typeof buf === "string") {
    return buf;
  }
  return core.write(toBuffer(buf));
}

function end(
  this: DecoderState,
  buf?: ArrayBufferView | DataView | string,
): string {
  const core = inner(this);
  let ret = "";
  if (buf !== undefined) {
    ret = this.write(buf);
  }
  return ret + core.end();
}

function text(
  this: DecoderState,
  buf: ArrayBufferView | DataView | string,
  offset?: number,
): string {
  const core = inner(this);
  // Workers clears the incomplete-character state rather than completing it.
  core.reset();
  // `buf.slice(offset)` mirrors workerd verbatim: inputs without a slice
  // method (DataView, non-views) throw TypeError here before write() runs.
  const sliced = (
    buf as unknown as { slice(offset?: number): typeof buf }
  ).slice(offset);
  return this.write(sliced);
}

// Minifiers rename the function; workerd always reports "StringDecoder".
Object.defineProperty(StringDecoder, "name", {
  value: "StringDecoder",
  configurable: true,
});

StringDecoder.prototype.write = write;
StringDecoder.prototype.end = end;
StringDecoder.prototype.text = text;

Object.defineProperties(StringDecoder.prototype, {
  lastChar: {
    enumerable: true,
    get(this: DecoderState): Uint8Array {
      return inner(this).lastChar;
    },
  },

  lastNeed: {
    enumerable: true,
    get(this: DecoderState): number {
      return inner(this).lastNeed;
    },
  },
  lastTotal: {
    enumerable: true,
    get(this: DecoderState): number {
      return inner(this).lastTotal;
    },
  },
});

export default {
  StringDecoder,
};
