import { Request as WorkerRequest } from "../compat/request/index.js";
import { Headers as WorkerHeaders } from "../compat/headers/index.js";
import { browserFetch } from "../compat/fetch/interop.js";
import { platform } from "../compat/globals/platform.js";
import { createFetch } from "../compat/fetch/index.js";
import {
  createNativeNetwork,
  getNativeCall,
} from "../compat/fetch/native-network.js";
import { createNetworkScope } from "../compat/fetch/scope.js";
import { FetchTransport } from "../compat/fetch/transport.js";
import type { RemoteWorkerOptions } from "./types.js";

/** Host-owned: credentials never cross the Dedicated Worker message boundary. */
export function createRemoteWorker(
  options: RemoteWorkerOptions,
  original: typeof fetch,
) {
  const origin = new URL(options.origin);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new TypeError(
      "remote.origin must be an HTTPS origin without a path, credentials, query or fragment.",
    );
  const lifetime = new AbortController();
  const native = getNativeCall();
  const scope = native ? createNetworkScope(native) : undefined;
  const send = scope
    ? createFetch(
        new FetchTransport(createNativeNetwork({ nativeCall: scope.call })),
      )
    : async (request: WorkerRequest) =>
        browserFetch(
          new platform.Request(request.url, {
            method: request.method,
            headers: [...request.headers],
            body: await browserBody(request),
            signal: request.signal,
            credentials: "omit",
            redirect: "error",
            duplex: "half",
          } as RequestInit),
          undefined,
          original,
        );
  return {
    async fetch(request: Request): Promise<Response> {
      const signal = AbortSignal.any([request.signal, lifetime.signal]);
      signal.throwIfAborted();
      const source = new URL(request.url);
      const target = new URL(origin);
      target.pathname = source.pathname;
      target.search = source.search;
      const headers = new WorkerHeaders(request.headers);
      headers.delete("host");
      // Local document cookies are not the deployed Worker's session cookie jar.
      headers.delete("cookie");
      let aborted!: () => void;
      const cancellation = new Promise<never>((_resolve, reject) => {
        aborted = () => reject(signal.reason);
        signal.addEventListener("abort", aborted, { once: true });
      });
      try {
        if (options.getToken) {
          headers.delete("authorization");
          const token = await Promise.race([
            Promise.resolve().then(options.getToken),
            cancellation,
          ]);
          if (token) headers.set("authorization", `Bearer ${token}`);
        }
        signal.throwIfAborted();
        const outgoing = new WorkerRequest(target, {
          method: request.method,
          headers,
          body: request.body,
          signal,
          redirect: "manual",
        });
        const response = await Promise.race([
          send(outgoing) as unknown as Promise<Response>,
          cancellation,
        ]);
        if (
          [301, 302, 303, 307, 308].includes(response.status) &&
          response.headers.has("location")
        ) {
          await response.body?.cancel();
          throw new TypeError(
            "Remote Worker redirects must not forward credentials or replay requests",
          );
        }
        return response;
      } finally {
        signal.removeEventListener("abort", aborted);
      }
    },
    dispose() {
      lifetime.abort(new Error("Remote Worker runtime disposed"));
      return scope?.dispose();
    },
  };
}

// WebKit and HTTP/1 browser fetch do not support arbitrary streaming uploads.
// Native execution keeps the existing streaming byte transport.
async function browserBody(request: WorkerRequest) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const abort = () => {
    void reader.cancel(request.signal.reason).catch(() => {});
  };
  request.signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      request.signal.throwIfAborted();
      const part = await reader.read();
      request.signal.throwIfAborted();
      if (part.done) break;
      chunks.push(part.value);
      length += part.value.length;
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  } finally {
    request.signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
