/// <reference path="./wasm.d.ts" />
import {
  initSync,
  DecompressStream,
  BrotliStreamResultCode,
} from "brotli-dec-wasm/web";
import wasm from "brotli-dec-wasm/web/bg.wasm";

/** One input chunk and one 64 KiB output chunk; decoding follows consumer pulls. */
export function decompressBrotli(
  source: ReadableStream<Uint8Array<ArrayBuffer>>,
) {
  const reader = source.getReader();
  let decoder: DecompressStream | undefined;
  let input = new Uint8Array(0);
  let code = BrotliStreamResultCode.NeedsMoreInput;
  let closed = false;
  const release = () => {
    decoder?.free();
    decoder = undefined;
  };
  return new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      async pull(controller) {
        try {
          if (!decoder) {
            initSync({ module: wasm });
            decoder = new DecompressStream();
          }
          while (!closed) {
            if (code !== BrotliStreamResultCode.NeedsMoreOutput) {
              const next = await reader.read();
              if (closed) return;
              if (next.done) {
                if (code !== BrotliStreamResultCode.ResultSuccess)
                  throw new TypeError("Truncated Brotli response");
                closed = true;
                release();
                reader.releaseLock();
                controller.close();
                return;
              }
              if (!next.value.byteLength) continue;
              if (code === BrotliStreamResultCode.ResultSuccess)
                throw new TypeError("Trailing Brotli data");
              input = next.value;
            }
            const result = decoder.decompress(input, 65536);
            let output: Uint8Array<ArrayBuffer>;
            try {
              code = result.code;
              input = input.subarray(result.input_offset);
              output = new Uint8Array(result.buf);
            } finally {
              result.free();
            }
            if (code === BrotliStreamResultCode.ResultSuccess && input.length)
              throw new TypeError("Trailing Brotli data");
            if (output.length) {
              controller.enqueue(output);
              return;
            }
          }
        } catch (error) {
          closed = true;
          release();
          await reader.cancel(error).catch(() => {});
          reader.releaseLock();
          controller.error(error);
        }
      },
      async cancel(reason) {
        closed = true;
        release();
        try {
          await reader.cancel(reason);
        } finally {
          reader.releaseLock();
        }
      },
    },
    { highWaterMark: 0 },
  );
}
