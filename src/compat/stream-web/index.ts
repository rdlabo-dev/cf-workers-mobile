// node:stream/web exposes the platform stream constructors.
export const ReadableStream = globalThis.ReadableStream;
export const WritableStream = globalThis.WritableStream;
export const TransformStream = globalThis.TransformStream;
export const CompressionStream = globalThis.CompressionStream;
export const DecompressionStream = globalThis.DecompressionStream;
export const TextEncoderStream = globalThis.TextEncoderStream;
export const TextDecoderStream = globalThis.TextDecoderStream;
export const ByteLengthQueuingStrategy = globalThis.ByteLengthQueuingStrategy;
export const CountQueuingStrategy = globalThis.CountQueuingStrategy;
export const ReadableByteStreamController =
  globalThis.ReadableByteStreamController;
export const ReadableStreamBYOBReader = globalThis.ReadableStreamBYOBReader;
export const ReadableStreamBYOBRequest = globalThis.ReadableStreamBYOBRequest;
export const ReadableStreamDefaultController =
  globalThis.ReadableStreamDefaultController;
export const ReadableStreamDefaultReader =
  globalThis.ReadableStreamDefaultReader;
export const TransformStreamDefaultController =
  globalThis.TransformStreamDefaultController;
export const WritableStreamDefaultController =
  globalThis.WritableStreamDefaultController;
export const WritableStreamDefaultWriter =
  globalThis.WritableStreamDefaultWriter;
export default {
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

  ReadableStream,
  WritableStream,
  TransformStream,
  CompressionStream,
  DecompressionStream,
  TextEncoderStream,
  TextDecoderStream,
};
