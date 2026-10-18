import { brotliCompressSync } from "node:zlib";
import { expect, it, vi } from "vitest";
// Exercise the published JS/WASM compilation, not a test-only WASM loader.
const { decompressBrotli } = (await import(
  new URL("../../../dist/compat/brotli/index.js", import.meta.url).href
)) as typeof import("./index.js");

function source(bytes: Uint8Array, size: number) {
  let offset = 0;
  return new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      pull(controller) {
        if (offset === bytes.length) {
          controller.close();
          return;
        }
        controller.enqueue(
          new Uint8Array(bytes.subarray(offset, offset + size)),
        );
        offset = Math.min(offset + size, bytes.length);
      },
    },
    { highWaterMark: 0 },
  );
}
it("decodes fragmented input with bounded output and consumer backpressure", async () => {
  const data = new Uint8Array(1024 * 1024).fill(97);
  const compressed = brotliCompressSync(data);
  const reader = decompressBrotli(source(compressed, 1)).getReader();
  let size = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    expect(next.value.byteLength).toBeLessThanOrEqual(65536);
    expect(next.value.every((value) => value === 97)).toBe(true);
    size += next.value.length;
  }
  expect(size).toBe(data.length);
});
it("rejects truncated and corrupt streams", async () => {
  const bytes = brotliCompressSync("compressed response");
  for (const input of [
    bytes.subarray(0, -1),
    new Uint8Array([255, 255, 255]),
  ]) {
    await expect(
      new Response(decompressBrotli(source(input, 1))).arrayBuffer(),
    ).rejects.toBeDefined();
  }
});
it("cancellation releases the upstream without eager reads", async () => {
  const cancel = vi.fn();
  const pull = vi.fn();
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>(
    { pull, cancel },
    { highWaterMark: 0 },
  );
  const decoded = decompressBrotli(stream);
  await Promise.resolve();
  expect(pull).not.toHaveBeenCalled();
  await decoded.cancel("stopped");
  expect(cancel).toHaveBeenCalledWith("stopped");
  expect(stream.locked).toBe(false);
});
it("cancels a pending upstream read and releases its lock", async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>(
    { cancel },
    { highWaterMark: 0 },
  );
  const reader = decompressBrotli(stream).getReader();
  const reading = reader.read();
  await Promise.resolve();
  await reader.cancel("stopped");
  expect(await reading).toEqual({ done: true, value: undefined });
  expect(cancel).toHaveBeenCalledWith("stopped");
  expect(stream.locked).toBe(false);
});

it("releases the source lock even when upstream cancellation rejects", async () => {
  const failure = new Error("upstream cancel failed");
  const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
    cancel() {
      throw failure;
    },
  });
  await expect(decompressBrotli(source).cancel()).rejects.toBe(failure);
  expect(source.locked).toBe(false);
});
