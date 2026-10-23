import { contextConstructor } from "./context.js";
import * as ponyfill from "./ponyfill.js";
import { nativeStreams } from "../../shared/globals/platform.js";
// Use owned Streams on every host: native Streams differ from Workers
// in tee cancellation and pending pipeTo abort behavior.
export const usesPonyfill = true;
export const ReadableStream: typeof globalThis.ReadableStream =
  contextConstructor(
    (usesPonyfill
      ? ponyfill.ReadableStream
      : nativeStreams.ReadableStream) as unknown as typeof globalThis.ReadableStream,
    ["start", "pull", "cancel"],
  );
export const WritableStream: typeof globalThis.WritableStream =
  contextConstructor(
    (usesPonyfill
      ? ponyfill.WritableStream
      : nativeStreams.WritableStream) as unknown as typeof globalThis.WritableStream,
    ["start", "write", "close", "abort"],
  );
export const TransformStream: typeof globalThis.TransformStream =
  contextConstructor(
    (usesPonyfill
      ? ponyfill.TransformStream
      : nativeStreams.TransformStream) as unknown as typeof globalThis.TransformStream,
    ["start", "transform", "flush", "cancel"],
  );
export const ByteLengthQueuingStrategy: typeof globalThis.ByteLengthQueuingStrategy =
  (usesPonyfill
    ? ponyfill.ByteLengthQueuingStrategy
    : nativeStreams.ByteLengthQueuingStrategy) as unknown as typeof globalThis.ByteLengthQueuingStrategy;
export const CountQueuingStrategy: typeof globalThis.CountQueuingStrategy =
  (usesPonyfill
    ? ponyfill.CountQueuingStrategy
    : nativeStreams.CountQueuingStrategy) as unknown as typeof globalThis.CountQueuingStrategy;
export const ReadableByteStreamController: typeof globalThis.ReadableByteStreamController =
  (usesPonyfill
    ? ponyfill.ReadableByteStreamController
    : nativeStreams.ReadableByteStreamController) as unknown as typeof globalThis.ReadableByteStreamController;
export const ReadableStreamBYOBReader: typeof globalThis.ReadableStreamBYOBReader =
  (usesPonyfill
    ? ponyfill.ReadableStreamBYOBReader
    : nativeStreams.ReadableStreamBYOBReader) as unknown as typeof globalThis.ReadableStreamBYOBReader;
export const ReadableStreamBYOBRequest: typeof globalThis.ReadableStreamBYOBRequest =
  (usesPonyfill
    ? ponyfill.ReadableStreamBYOBRequest
    : nativeStreams.ReadableStreamBYOBRequest) as unknown as typeof globalThis.ReadableStreamBYOBRequest;
export const ReadableStreamDefaultController: typeof globalThis.ReadableStreamDefaultController =
  (usesPonyfill
    ? ponyfill.ReadableStreamDefaultController
    : nativeStreams.ReadableStreamDefaultController) as unknown as typeof globalThis.ReadableStreamDefaultController;
export const ReadableStreamDefaultReader: typeof globalThis.ReadableStreamDefaultReader =
  (usesPonyfill
    ? ponyfill.ReadableStreamDefaultReader
    : nativeStreams.ReadableStreamDefaultReader) as unknown as typeof globalThis.ReadableStreamDefaultReader;
export const TransformStreamDefaultController: typeof globalThis.TransformStreamDefaultController =
  (usesPonyfill
    ? ponyfill.TransformStreamDefaultController
    : nativeStreams.TransformStreamDefaultController) as unknown as typeof globalThis.TransformStreamDefaultController;
export const WritableStreamDefaultController: typeof globalThis.WritableStreamDefaultController =
  (usesPonyfill
    ? ponyfill.WritableStreamDefaultController
    : nativeStreams.WritableStreamDefaultController) as unknown as typeof globalThis.WritableStreamDefaultController;
export const WritableStreamDefaultWriter: typeof globalThis.WritableStreamDefaultWriter =
  (usesPonyfill
    ? ponyfill.WritableStreamDefaultWriter
    : nativeStreams.WritableStreamDefaultWriter) as unknown as typeof globalThis.WritableStreamDefaultWriter;

/** Pinned ponyfill 4.3.0 disturbance state, including reads through BYOB readers. */
export function disturbed(stream: globalThis.ReadableStream): boolean {
  const value = (stream as unknown as { _disturbed: unknown })._disturbed;
  if (typeof value !== "boolean")
    throw new Error("Unknown stream disturbance state");
  return value;
}
