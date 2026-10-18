// Native document navigation has a buffered upload boundary. Bound it before
// concatenation/base64 conversion; Fetch-only Worker uploads are streamed.
export const maxDocumentUpload = 8 * 1024 * 1024;
export async function readDocumentBody(request: Request): Promise<ArrayBuffer> {
  const reader = request.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => {
    void reader.cancel(request.signal.reason).catch(() => {});
  };
  request.signal.addEventListener("abort", abort, { once: true });
  try {
    request.signal.throwIfAborted();
    for (;;) {
      const next = await reader.read();
      request.signal.throwIfAborted();
      if (next.done) break;
      size += next.value.length;
      if (size > maxDocumentUpload)
        throw new RangeError("Document upload exceeds 8 MiB");
      chunks.push(next.value);
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result.buffer;
  } catch (error) {
    void reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    request.signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
export function encodeDocumentBytes(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
