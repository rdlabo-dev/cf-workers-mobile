// Older WebKit exposes stream readers but no async iterator. Adapt only that
// host capability gap; arrays, user iterables and explicit iterator overrides
// retain their own iteration semantics.
export function iterable<T>(input: T): T | AsyncIterable<unknown> {
  if (
    typeof ReadableStream === "function" &&
    !(Symbol.asyncIterator in ReadableStream.prototype) &&
    input instanceof ReadableStream &&
    !(Symbol.asyncIterator in input)
  )
    return read(input);
  return input;
}
async function* read(stream: ReadableStream<unknown>) {
  const reader = stream.getReader();
  let finished = false;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        finished = true;
        return;
      }
      yield result.value;
    }
  } finally {
    try {
      if (!finished) await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  }
}
