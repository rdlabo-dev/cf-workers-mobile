const consumed = new WeakMap<
  ReadableStream<Uint8Array>,
  (count: number) => void
>();
export function observeConsumption(
  stream: ReadableStream<Uint8Array>,
  callback: (count: number) => void,
) {
  consumed.set(stream, callback);
}
/** Bounded adapter for engines (including WKWebView) without byte streams. */
export function socketReader(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  let remainder: Uint8Array | undefined;
  return {
    get closed() {
      return reader.closed;
    },
    cancel(reason?: unknown) {
      remainder = undefined;
      return reader.cancel(reason);
    },
    releaseLock() {
      reader.releaseLock();
    },
    async read(
      view: Uint8Array<ArrayBuffer>,
    ): Promise<ReadableStreamReadResult<Uint8Array<ArrayBuffer>>> {
      // Match BYOB ownership even on WebViews without byte streams.
      const transferred = structuredClone(view, { transfer: [view.buffer] });
      while (!remainder?.byteLength) {
        const next = await reader.read();
        if (next.done) return { done: true, value: undefined };
        remainder = next.value;
      }
      const count = Math.min(transferred.byteLength, remainder.byteLength);
      transferred.set(remainder.subarray(0, count));
      remainder = remainder.subarray(count);
      consumed.get(stream)?.(count);
      return { done: false, value: transferred.subarray(0, count) };
    },
  };
}
