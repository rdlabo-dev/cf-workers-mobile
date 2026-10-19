import { expect, it, vi } from "vitest";
import { nativeStreams } from "../../shared/globals/platform.js";
vi.mock("./runtime.js", () => ({ usesPonyfill: true }));
vi.mock("./index.js", async () => import("./ponyfill.js"));
import { readable } from "./interop.js";

it.each([[], [65, 66]])(
  "converts host byte streams with empty chunks: %j",
  async (...bytes) => {
    const source = new nativeStreams.ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(0));
        controller.enqueue(new Uint8Array(bytes));
        controller.enqueue(new Uint8Array(0));
        controller.close();
      },
    });
    const reader = readable(source).getReader();
    const actual: number[] = [];
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      actual.push(...result.value);
    }
    expect(actual).toEqual(bytes);
    expect(source.locked).toBe(false);
  },
);

it("preserves empty values in non-byte streams", async () => {
  const empty = new Uint8Array(0);
  const source = new nativeStreams.ReadableStream({
    start(c) {
      c.enqueue(empty);
      c.close();
    },
  });
  const reader = readable(source, false).getReader();
  expect(await reader.read()).toEqual({ value: empty, done: false });
  expect((await reader.read()).done).toBe(true);
});
