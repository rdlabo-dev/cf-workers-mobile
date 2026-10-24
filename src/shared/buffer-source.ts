// Intrinsic BufferSource access shared by owned API adapters.
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

export function bufferBytes(value: ArrayBufferLike): Uint8Array {
  try {
    return new Uint8Array(value);
  } catch {
    return new Uint8Array(0);
  }
}
