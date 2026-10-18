import { maxDocumentUpload } from "./body.js";
export interface DocumentRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: ArrayBuffer;
}
export interface DocumentRuntime {
  ready: Promise<unknown>;
  fetch: typeof fetch;
}
const redirects = [301, 302, 303, 307, 308];
function encode(bytes: ArrayBuffer) {
  let binary = "";
  const view = new Uint8Array(bytes);
  for (let offset = 0; offset < view.length; offset += 8192)
    binary += String.fromCharCode(...view.subarray(offset, offset + 8192));
  return btoa(binary);
}
export function installDocumentHost(runtime: DocumentRuntime, baseURL: string) {
  const host = globalThis as typeof globalThis & {
    __capacitorWorkersDispatch?: typeof nativeDispatch;
  };
  if (host.__capacitorWorkersDispatch)
    throw new Error("Document host is already installed");
  const streams = new Map<
    string,
    {
      reader: ReadableStreamDefaultReader<Uint8Array>;
      controller: AbortController;
      chunk?: Uint8Array;
      reading: boolean;
    }
  >();
  const requests = new Map<string, AbortController>();
  async function cancel(id: string) {
    requests.get(id)?.abort();
    requests.delete(id);
    const stream = streams.get(id);
    streams.delete(id);
    if (stream) {
      stream.chunk = undefined;
      stream.controller.abort();
      void stream.reader.cancel().catch(() => {});
    }
  }
  async function dispatch(request: DocumentRequest, signal: AbortSignal) {
    await runtime.ready;
    const url = new URL(request.url);
    if (
      url.origin !== new URL(baseURL).origin &&
      (url.protocol !== location.protocol || url.host !== location.host)
    )
      throw new TypeError("Document request is outside the local origin");
    const headers = new Headers(request.headers);
    headers.delete("if-none-match");
    headers.delete("if-modified-since");
    const target = new URL(url.pathname + url.search, baseURL).href;
    const response = await runtime.fetch(
      new Request(target, {
        method: request.method,
        headers,
        body: request.body,
        redirect: "manual",
        signal,
      }),
    );
    const resultHeaders = new Headers(response.headers);
    resultHeaders.set("cache-control", "no-store");
    return {
      url: target,
      status: response.status,
      headers: Object.fromEntries(resultHeaders),
      body: response.body,
    };
  }
  async function nativeDispatch(
    input: Omit<DocumentRequest, "body"> & {
      body?: string | ArrayBuffer;
      stream?: boolean;
      id?: string;
      action?: "pull" | "cancel";
      streamId?: string;
      document?: boolean;
      follow?: boolean;
      redirectCount?: number;
    },
  ) {
    if (input.action === "cancel") {
      await cancel(input.streamId!);
      return { done: true, body: "" };
    }
    if (input.action === "pull") {
      const id = input.streamId!;
      const stream = streams.get(id);
      if (!stream) throw new Error("Document stream closed");
      if (stream.reading) throw new Error("Concurrent document stream read");
      stream.reading = true;
      try {
        if (!stream.chunk?.byteLength) {
          const next = await stream.reader.read();
          if (next.done) {
            streams.delete(id);
            requests.delete(id);
            stream.reader.releaseLock();
            return { done: true, body: "" };
          }
          stream.chunk = next.value;
        }
        const bytes = stream.chunk.slice(0, 65536);
        stream.chunk = stream.chunk.subarray(bytes.length);
        return { done: false, body: encode(bytes.buffer) };
      } catch (error) {
        await cancel(id);
        throw error;
      } finally {
        stream.reading = false;
      }
    }
    if (
      typeof input.body === "string"
        ? input.body.length > Math.ceil(maxDocumentUpload / 3) * 4
        : (input.body?.byteLength ?? 0) > maxDocumentUpload
    )
      throw new RangeError("Document upload exceeds 8 MiB");
    const id = input.id ?? crypto.randomUUID();
    const controller = new AbortController();
    requests.set(id, controller);
    const publish = async (result: {
      body: ReadableStream<Uint8Array> | null;
      [key: string]: unknown;
    }) => {
      if (input.stream) {
        if (result.body)
          streams.set(id, {
            reader: result.body.getReader(),
            controller,
            reading: false,
          });
        else requests.delete(id);
        return { ...result, body: "", streamId: result.body ? id : undefined };
      }
      // Compatibility for older native callers is bounded. Current transports
      // always request streaming and never collect the complete response here.
      const reader = result.body?.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        if (reader)
          for (;;) {
            const next = await reader.read();
            if (next.done) break;
            size += next.value.length;
            if (size > 8 * 1024 * 1024)
              throw new RangeError(
                "Legacy document response exceeds 8 MiB; update the native transport",
              );
            chunks.push(next.value);
          }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        return { ...result, body: encode(bytes.buffer) };
      } catch (error) {
        void reader?.cancel(error).catch(() => {});
        throw error;
      } finally {
        requests.delete(id);
        reader?.releaseLock();
      }
    };
    try {
      let request: DocumentRequest = {
        ...input,
        body:
          input.body === undefined
            ? undefined
            : typeof input.body === "string"
              ? Uint8Array.from(atob(input.body), (c) => c.charCodeAt(0)).buffer
              : input.body,
      };
      for (let count = 0; ; count++) {
        const result = await dispatch(request, controller.signal);
        const locationHeader = result.headers.location;
        if (
          !redirects.includes(result.status) ||
          !locationHeader ||
          (!input.follow && !input.document)
        )
          return await publish(result);
        void result.body?.cancel().catch(() => {});
        if ((input.follow ? count : (input.redirectCount ?? 0)) >= 20)
          throw new TypeError("Too many redirects");
        const target = new URL(locationHeader, result.url);
        if (target.origin !== new URL(baseURL).origin)
          throw new TypeError("External document redirects are not supported");
        const becomesGET =
          ((result.status === 301 || result.status === 302) &&
            request.method === "POST") ||
          (result.status === 303 && !["GET", "HEAD"].includes(request.method));
        const headers = new Headers(request.headers);
        if (becomesGET)
          for (const name of [
            "content-type",
            "content-length",
            "content-encoding",
            "content-language",
            "content-location",
          ])
            headers.delete(name);
        request = {
          ...request,
          url: target.href,
          method: becomesGET ? "GET" : request.method,
          body: becomesGET ? undefined : request.body,
          headers: Object.fromEntries(headers),
        };
        if (!input.follow) {
          const local = new URL(input.url);
          const url =
            local.protocol +
            "//" +
            local.host +
            target.pathname +
            target.search +
            target.hash;
          result.headers.location = url;
          return {
            ...result,
            body: "",
            navigation: {
              url,
              method: request.method,
              headers: request.headers,
              ...(request.body === undefined
                ? {}
                : { body: encode(request.body) }),
            },
          };
        }
      }
    } catch (error) {
      await cancel(id);
      throw error;
    } finally {
      if (!streams.has(id)) requests.delete(id);
    }
  }
  const message = async (event: MessageEvent<DocumentRequest>) => {
    const port = event.ports[0];
    if (!port) return;
    try {
      port.postMessage(await nativeDispatch(event.data));
    } catch (error) {
      port.postMessage({ error: String(error) });
    } finally {
      port.close();
    }
  };
  host.__capacitorWorkersDispatch = nativeDispatch;
  globalThis.navigator?.serviceWorker?.addEventListener("message", message);
  return () => {
    for (const id of requests.keys()) void cancel(id);
    if (host.__capacitorWorkersDispatch === nativeDispatch)
      delete host.__capacitorWorkersDispatch;
    globalThis.navigator?.serviceWorker?.removeEventListener(
      "message",
      message,
    );
  };
}
