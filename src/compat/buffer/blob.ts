import { readable } from "../stream-web/interop.js";
/** Buffer's Blob/File exports use the pinned Workers constructor semantics. */
import {
  platform,
  nativeBlobConstructor,
  nativeFileConstructor,
} from "../../shared/globals/platform.js";
const NativeBlob = platform.Blob;
const NativeFile = platform.File;
const nativeSize = Object.getOwnPropertyDescriptor(
  NativeBlob.prototype,
  "size",
)!.get!;
const nativeType = Object.getOwnPropertyDescriptor(
  NativeBlob.prototype,
  "type",
)!.get!;
const nativeName = Object.getOwnPropertyDescriptor(
  NativeFile.prototype,
  "name",
)!.get!;
const nativeModified = Object.getOwnPropertyDescriptor(
  NativeFile.prototype,
  "lastModified",
)!.get!;
const types = new WeakMap<object, string>();
const typeMetadata = Symbol.for("@rdlabo/workers-capacitor/blob-type");
const modified = new WeakMap<object, number>();
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
function wtf8(text: string): Uint8Array<ArrayBuffer> {
  const bytes = encoder.encode(text);
  let offset = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (
      c >= 0xd800 &&
      c <= 0xdbff &&
      text.charCodeAt(i + 1) >= 0xdc00 &&
      text.charCodeAt(i + 1) <= 0xdfff
    ) {
      i++;
      offset += 4;
    } else {
      if (c >= 0xd800 && c <= 0xdfff) {
        bytes[offset] = 0xed;
        bytes[offset + 1] = 0x80 | ((c >> 6) & 63);
        bytes[offset + 2] = 0x80 | (c & 63);
      }
      offset += c < 128 ? 1 : c < 2048 ? 2 : 3;
    }
  }
  return bytes;
}
const arrayBufferLength = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength",
)!.get!;
const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
const getters = (prototype: object) =>
  ["buffer", "byteOffset", "byteLength"].map(
    (key) => Object.getOwnPropertyDescriptor(prototype, key)!.get!,
  );
const typedGetters = getters(typedArray);
const dataGetters = getters(DataView.prototype);
function isArrayBuffer(value: unknown): boolean {
  try {
    arrayBufferLength.call(value);
    return true;
  } catch {
    return false;
  }
}
function parts(value: BlobPart[] | undefined, name: string): BlobPart[] {
  if (value === undefined) return [];
  if (!Array.isArray(value))
    throw new TypeError(
      `Failed to construct '${name}': constructor parameter 1 is not of type 'Array'.`,
    );
  const result: BlobPart[] = [];
  for (let i = 0; i < value.length; i++) {
    const part = value[i];
    result.push(
      part instanceof NativeBlob ||
        ArrayBuffer.isView(part) ||
        isArrayBuffer(part)
        ? part
        : wtf8(`${part}`),
    );
  }
  return result;
}
function snapshot(data: BlobPart[]): BlobPart[] {
  return data.map((part) => {
    if (part instanceof NativeBlob) return part;
    try {
      if (ArrayBuffer.isView(part)) {
        let access = typedGetters;
        try {
          typedGetters[0]!.call(part);
        } catch {
          access = dataGetters;
        }
        return new Uint8Array(
          access[0]!.call(part),
          access[1]!.call(part),
          access[2]!.call(part),
        ).slice();
      }
      return new Uint8Array(part as ArrayBuffer).slice();
    } catch {
      return new Uint8Array();
    }
  });
}
function endings(value: BlobPropertyBag) {
  if (value.endings !== undefined)
    throw new Error("The 'endings' field on 'Options' is not implemented.");
}
function type(value: unknown) {
  if (value === undefined) return "";
  const text = `${value}`;
  return /[^\x20-\x7f]/.test(text) ? "" : text.toLowerCase();
}
function options(
  value: BlobPropertyBag | null | undefined,
  name: string,
  position: number,
) {
  if (
    value !== undefined &&
    value !== null &&
    typeof value !== "object" &&
    typeof value !== "function"
  )
    throw new TypeError(
      `Failed to construct '${name}': constructor parameter ${position} is not of type 'Options'.`,
    );
  return value ?? {};
}
function index(value: number | undefined) {
  if (value === undefined) return undefined;
  const number = +value;
  if (!Number.isFinite(number)) return 0;
  const truncated = Math.trunc(number);
  if (truncated < -2147483648 || truncated > 2147483647)
    throw new TypeError(
      "Value out of range. Must be between -2147483648 and 2147483647 (inclusive).",
    );
  return truncated;
}
export class Blob extends NativeBlob {
  constructor(bits?: BlobPart[], init?: BlobPropertyBag) {
    const data = parts(bits, "Blob"),
      settings = options(init, "Blob", 2),
      mime = type(settings.type);
    endings(settings);
    super(snapshot(data), { type: mime });
    types.set(this, mime);
  }
  static [Symbol.hasInstance](value: unknown) {
    if (this !== Blob)
      return Function.prototype[Symbol.hasInstance].call(this, value);
    try {
      nativeSize.call(value);
      return true;
    } catch {
      return false;
    }
  }
  override get type() {
    return types.get(this) ?? nativeType.call(this);
  }
  override stream() {
    return readable(NativeBlob.prototype.stream.call(this));
  }
  override async text() {
    return decoder.decode(await NativeBlob.prototype.arrayBuffer.call(this));
  }
  override async bytes() {
    return new Uint8Array(await NativeBlob.prototype.arrayBuffer.call(this));
  }
  override slice(start?: number, end?: number, contentType?: string) {
    const from = index(start),
      to = index(end),
      mime = type(contentType);
    const value = NativeBlob.prototype.slice.call(this, from, to, mime);
    Object.setPrototypeOf(value, Blob.prototype);
    types.set(value, mime);
    return value;
  }
}
export class File extends Blob {
  constructor(bits: BlobPart[], name: string, init?: FilePropertyBag) {
    super();
    if (arguments.length < 2)
      throw new TypeError(
        "Failed to construct 'File': constructor parameter 2 is not of type 'string'.",
      );
    const data = parts(bits, "File"),
      filename = decoder.decode(wtf8(`${name}`)),
      settings = options(init, "File", 3) as FilePropertyBag;
    const mime = type(settings.type),
      lastModified = settings.lastModified,
      date = lastModified === undefined ? Date.now() : +lastModified;
    endings(settings);
    // Native File branding lets FormData and host body APIs consume the object.
    const value: File = Reflect.construct(
      NativeFile,
      [snapshot(data), filename, { type: mime }],
      new.target,
    );
    types.set(value, mime);
    modified.set(value, Number.isNaN(date) ? 0 : date);
    return value;
  }
  static override [Symbol.hasInstance](value: unknown) {
    if (this !== File)
      return Function.prototype[Symbol.hasInstance].call(this, value);
    try {
      nativeName.call(value);
      return true;
    } catch {
      return false;
    }
  }
  get name(): string {
    return nativeName.call(this);
  }
  get lastModified(): number {
    return modified.get(this) ?? nativeModified.call(this);
  }
}
// Independently bundled contracts may load after runtime installation. Keep
// host constructors recoverable without storing state on window/globalThis.
Object.defineProperty(Blob.prototype, typeMetadata, {
  value(this: Blob) {
    return types.get(this) ?? nativeType.call(this);
  },
});
Object.defineProperty(Blob, nativeBlobConstructor, { value: NativeBlob });
Object.defineProperty(File, nativeFileConstructor, { value: NativeFile });
Object.defineProperty(Blob, "length", { value: 0 });
Object.defineProperty(File, "length", { value: 0 });
Object.defineProperty(File.prototype, Symbol.toStringTag, {
  value: "File",
  configurable: true,
});
/** Clone immutable bytes while preserving Workers metadata, without JS I/O. */
export function cloneBlob(value: Blob): Blob {
  return new Blob([value], {
    type:
      Object.getPrototypeOf(value)[typeMetadata]?.call(value) ??
      nativeType.call(value),
  });
}
