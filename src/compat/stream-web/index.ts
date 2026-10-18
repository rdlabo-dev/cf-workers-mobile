export {
  ReadableStream,
  WritableStream,
  TransformStream,
  ByteLengthQueuingStrategy,
  CountQueuingStrategy,
  ReadableByteStreamController,
  ReadableStreamBYOBReader,
  ReadableStreamBYOBRequest,
  ReadableStreamDefaultController,
  ReadableStreamDefaultReader,
  TransformStreamDefaultController,
  WritableStreamDefaultController,
  WritableStreamDefaultWriter,
} from "./runtime.js";
import * as core from "./runtime.js";
import { readable, writable, nativeStreams } from "./interop.js";
const CompressionStreamAdapter = class CompressionStream {
  readonly #native: InstanceType<typeof nativeStreams.CompressionStream>;
  readonly #readable: ReadableStream<Uint8Array>;
  readonly #writable: WritableStream<BufferSource>;
  constructor(
    ...args: ConstructorParameters<typeof nativeStreams.CompressionStream>
  ) {
    this.#native = new nativeStreams.CompressionStream(...args);
    this.#readable = readable(this.#native.readable as any) as any;
    this.#writable = writable(this.#native.writable as any);
  }
  get readable() {
    return this.#readable;
  }
  get writable() {
    return this.#writable;
  }
};
export const CompressionStream: typeof globalThis.CompressionStream =
  (core.usesPonyfill
    ? CompressionStreamAdapter
    : nativeStreams.CompressionStream) as unknown as typeof globalThis.CompressionStream;
const DecompressionStreamAdapter = class DecompressionStream {
  readonly #native: InstanceType<typeof nativeStreams.DecompressionStream>;
  readonly #readable: ReadableStream<Uint8Array>;
  readonly #writable: WritableStream<BufferSource>;
  constructor(
    ...args: ConstructorParameters<typeof nativeStreams.DecompressionStream>
  ) {
    this.#native = new nativeStreams.DecompressionStream(...args);
    this.#readable = readable(this.#native.readable as any) as any;
    this.#writable = writable(this.#native.writable as any);
  }
  get readable() {
    return this.#readable;
  }
  get writable() {
    return this.#writable;
  }
};
export const DecompressionStream: typeof globalThis.DecompressionStream =
  (core.usesPonyfill
    ? DecompressionStreamAdapter
    : nativeStreams.DecompressionStream) as unknown as typeof globalThis.DecompressionStream;
const TextEncoderStreamAdapter = class TextEncoderStream {
  readonly #native: InstanceType<typeof nativeStreams.TextEncoderStream>;
  readonly #readable: ReadableStream<Uint8Array>;
  readonly #writable: WritableStream<string>;
  constructor(
    ...args: ConstructorParameters<typeof nativeStreams.TextEncoderStream>
  ) {
    this.#native = new nativeStreams.TextEncoderStream(...args);
    this.#readable = readable(this.#native.readable as any) as any;
    this.#writable = writable(this.#native.writable as any);
  }
  get readable() {
    return this.#readable;
  }
  get writable() {
    return this.#writable;
  }
  get encoding() {
    return this.#native.encoding;
  }
};
export const TextEncoderStream: typeof globalThis.TextEncoderStream =
  (core.usesPonyfill
    ? TextEncoderStreamAdapter
    : nativeStreams.TextEncoderStream) as unknown as typeof globalThis.TextEncoderStream;
const TextDecoderStreamAdapter = class TextDecoderStream {
  readonly #native: InstanceType<typeof nativeStreams.TextDecoderStream>;
  readonly #readable: ReadableStream<string>;
  readonly #writable: WritableStream<BufferSource>;
  constructor(
    ...args: ConstructorParameters<typeof nativeStreams.TextDecoderStream>
  ) {
    this.#native = new nativeStreams.TextDecoderStream(...args);
    this.#readable = readable(this.#native.readable as any, false) as any;
    this.#writable = writable(this.#native.writable as any);
  }
  get readable() {
    return this.#readable;
  }
  get writable() {
    return this.#writable;
  }
  get encoding() {
    return this.#native.encoding;
  }
  get fatal() {
    return this.#native.fatal;
  }
  get ignoreBOM() {
    return this.#native.ignoreBOM;
  }
};
export const TextDecoderStream: typeof globalThis.TextDecoderStream =
  (core.usesPonyfill
    ? TextDecoderStreamAdapter
    : nativeStreams.TextDecoderStream) as unknown as typeof globalThis.TextDecoderStream;
export default {
  ReadableStream: core.ReadableStream,
  WritableStream: core.WritableStream,
  TransformStream: core.TransformStream,
  ByteLengthQueuingStrategy: core.ByteLengthQueuingStrategy,
  CountQueuingStrategy: core.CountQueuingStrategy,
  ReadableByteStreamController: core.ReadableByteStreamController,
  ReadableStreamBYOBReader: core.ReadableStreamBYOBReader,
  ReadableStreamBYOBRequest: core.ReadableStreamBYOBRequest,
  ReadableStreamDefaultController: core.ReadableStreamDefaultController,
  ReadableStreamDefaultReader: core.ReadableStreamDefaultReader,
  TransformStreamDefaultController: core.TransformStreamDefaultController,
  WritableStreamDefaultController: core.WritableStreamDefaultController,
  WritableStreamDefaultWriter: core.WritableStreamDefaultWriter,
  CompressionStream,
  DecompressionStream,
  TextEncoderStream,
  TextDecoderStream,
};

for (const [name, Type] of Object.entries({
  CompressionStreamAdapter,
  DecompressionStreamAdapter,
  TextEncoderStreamAdapter,
  TextDecoderStreamAdapter,
})) {
  const tag = name.replace("Adapter", "");
  Object.defineProperty(Type, "name", { value: tag, configurable: true });
  Object.defineProperty(Type.prototype, Symbol.toStringTag, {
    value: tag,
    configurable: true,
  });
  for (const key of Object.getOwnPropertyNames(Type.prototype))
    if (key !== "constructor")
      Object.defineProperty(Type.prototype, key, {
        ...Object.getOwnPropertyDescriptor(Type.prototype, key),
        enumerable: true,
      });
}
