import { nativeStreams } from "../../shared/globals/platform.js";
import { usesPonyfill } from "./runtime.js";
import { ReadableStream, WritableStream } from "./index.js";
/** Convert host byte streams without buffering the entire body or pre-reading it. */
export function readable<T extends Uint8Array>(
  source: globalThis.ReadableStream<T>,
  byteStream?: true,
): globalThis.ReadableStream<T>;
export function readable<T>(
  source: globalThis.ReadableStream<T>,
  byteStream: false,
): globalThis.ReadableStream<T>;
export function readable(
  source: globalThis.ReadableStream<any>,
  byteStream = true,
): globalThis.ReadableStream<any> {
  if (!usesPonyfill || (source as unknown) instanceof ReadableStream)
    return source;
  if (source.locked) throw new TypeError("ReadableStream is locked");
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const release = () => {
    reader?.releaseLock();
    reader = undefined;
  };
  return new ReadableStream<Uint8Array>(
    {
      type: byteStream ? "bytes" : undefined,
      async pull(controller: any) {
        try {
          reader ??= source.getReader();
          const result = await reader.read();
          if (result.done) {
            controller.close();
            controller.byobRequest?.respond(0);
            release();
          } else
            controller.enqueue(
              byteStream ? result.value.slice() : result.value,
            );
        } catch (error) {
          controller.error(error);
          release();
        }
      },
      async cancel(reason) {
        try {
          await (reader ? reader.cancel(reason) : source.cancel(reason));
        } finally {
          release();
        }
      },
    },
    { highWaterMark: 0 },
  );
}
export function writable<T>(
  source: globalThis.WritableStream<T>,
): globalThis.WritableStream<T> {
  if (!usesPonyfill || (source as unknown) instanceof WritableStream)
    return source;
  const writer = source.getWriter();
  return new WritableStream<T>({
    write(chunk) {
      return writer.write(chunk);
    },
    async close() {
      try {
        await writer.close();
      } finally {
        writer.releaseLock();
      }
    },
    async abort(reason) {
      try {
        await writer.abort(reason);
      } finally {
        writer.releaseLock();
      }
    },
  });
}
export { nativeStreams };
