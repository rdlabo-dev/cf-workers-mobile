// node:stream/web exposes the platform stream constructors.
export const ReadableStream = globalThis.ReadableStream;
export const WritableStream = globalThis.WritableStream;
export const TransformStream = globalThis.TransformStream;
export const CompressionStream = globalThis.CompressionStream;
export const DecompressionStream = globalThis.DecompressionStream;
export const TextEncoderStream = globalThis.TextEncoderStream;
export const TextDecoderStream = globalThis.TextDecoderStream;
export default {
  ReadableStream,
  WritableStream,
  TransformStream,
  CompressionStream,
  DecompressionStream,
  TextEncoderStream,
  TextDecoderStream,
};
