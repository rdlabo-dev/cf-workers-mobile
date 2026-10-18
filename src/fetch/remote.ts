import {
  Response as WorkerResponse,
  networkResponse,
} from "../compat/response/index.js";
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
    : async (request: WorkerRequest) => {
        const response = await browserFetch(
          new platform.Request(request.url, {
            method: request.method,
            headers: [...request.headers],
            body: await browserBody(request),
            signal: request.signal,
            credentials: "include",
            redirect: "manual",
            duplex: "half",
          } as RequestInit),
          undefined,
          original,
        );
        if (response.status === 0)
          throw new TypeError(
            "Browser Fetch hides remote redirect locations. Remote redirects require the native transport.",
          );
        return response;
      };
  return {
    async fetch(request: Request): Promise<Response> {
      const signal = AbortSignal.any([request.signal, lifetime.signal]);
      signal.throwIfAborted();
      const source = new URL(request.url);
      let target = new URL(origin);
      target.pathname = source.pathname;
      target.search = source.search;
      const headers = new WorkerHeaders(request.headers);
      headers.delete("host");
      // Document cookies are a different jar. Only the remote origin's native
      // cookie store (or the browser's own credential store) supplies cookies.
      headers.delete("cookie");
      // Preserve CSRF checks for this application's logical origin only.
      for (const name of ["origin", "referer"]) {
        const value = headers.get(name);
        if (!value) continue;
        try {
          const url = new URL(value);
          if (
            url.origin === source.origin ||
            (globalThis.location &&
              url.protocol === globalThis.location.protocol &&
              url.host === globalThis.location.host)
          ) {
            headers.set(
              name,
              name === "origin" ? origin.origin : remapURL(url, origin).href,
            );
          }
        } catch {
          /* Preserve malformed/external origins for server validation. */
        }
      }
      let aborted!: () => void;
      const cancellation = new Promise<never>((_resolve, reject) => {
        aborted = () => reject(signal.reason);
        signal.addEventListener("abort", aborted, { once: true });
      });
      const wait = <T>(operation: Promise<T>) =>
        Promise.race([operation, cancellation]);
      try {
        if (options.getToken) {
          headers.delete("authorization");
          const token = await wait(Promise.resolve().then(options.getToken));
          if (token) headers.set("authorization", `Bearer ${token}`);
        }
        signal.throwIfAborted();
        let method = request.method;
        // Follow mode needs a replayable body for 307/308. Manual document
        // requests keep streaming; the document host owns any subsequent hop.
        let body: BodyInit | null = request.body;
        if (body && request.redirect === "follow")
          body = await wait(
            browserBody(new WorkerRequest(target, { method, body, signal })),
          );
        for (let hop = 0; ; hop++) {
          signal.throwIfAborted();
          if (native) {
            const cookie = (await wait(
              native("WorkersCapacitor", "cookiesGet", { url: target.href }),
            )) as { cookie?: string };
            headers.delete("cookie");
            if (cookie?.cookie) headers.set("cookie", cookie.cookie);
          }
          signal.throwIfAborted();
          const outgoing = new WorkerRequest(target, {
            method,
            headers,
            body,
            signal,
            redirect: "manual",
          });
          const response = await wait(send(outgoing));
          try {
            signal.throwIfAborted();
            const responseHeaders = new WorkerHeaders(response.headers);
            if (native) {
              const cookies = responseHeaders
                .getSetCookie()
                .flatMap((value) => scopedCookie(value, target));
              if (cookies.length)
                await wait(
                  native("WorkersCapacitor", "cookiesSet", {
                    url: target.href,
                    cookies,
                  }),
                );
            }
            // A remote Set-Cookie must never install an HttpOnly session on the
            // Capacitor document origin, or expose it to page JavaScript.
            responseHeaders.delete("set-cookie");
            signal.throwIfAborted();
            const location = responseHeaders.get("location");
            if (
              ![301, 302, 303, 307, 308].includes(response.status) ||
              !location
            ) {
              return networkResponse(
                response.body,
                {
                  status: response.status,
                  statusText: response.statusText,
                  headers: responseHeaders,
                },
                remapURL(target, source).href,
                hop > 0,
              ) as unknown as Response;
            }
            const next = new URL(location, target);
            if (next.origin !== origin.origin || next.username || next.password)
              throw new TypeError(
                "Remote Worker redirects must stay within remote.origin",
              );
            if (request.redirect === "error")
              throw new TypeError(
                "Remote Worker redirect rejected by request policy",
              );
            if (request.redirect === "manual") {
              responseHeaders.set("location", remapURL(next, source).href);
              return new WorkerResponse(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders,
              }) as unknown as Response;
            }
            if (hop >= 20)
              throw new TypeError("Too many remote Worker redirects");
            await response.body?.cancel();
            const becomesGET =
              ((response.status === 301 || response.status === 302) &&
                method === "POST") ||
              (response.status === 303 && !["GET", "HEAD"].includes(method));
            if (becomesGET) {
              method = "GET";
              body = null;
              for (const name of [
                "content-type",
                "content-length",
                "content-encoding",
                "content-language",
                "content-location",
              ])
                headers.delete(name);
            }
            target = next;
          } catch (error) {
            await response.body?.cancel().catch(() => {});
            throw error;
          }
        }
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

function remapURL(url: URL, destination: URL): URL {
  const mapped = new URL(destination.origin);
  mapped.pathname = url.pathname;
  mapped.search = url.search;
  mapped.hash = url.hash;
  return mapped;
}

// Narrow server cookies to this host, even if the server uses a parent Domain.
// The native cookie stores retain Path, Secure, HttpOnly and expiration rules.
function scopedCookie(value: string, target: URL): string[] {
  const parts = value.split(";");
  const attributes = parts.slice(1);
  for (const attribute of attributes) {
    const match = /^\s*domain\s*=\s*(.*?)\s*$/i.exec(attribute);
    if (!match) continue;
    const domain = match[1].replace(/^\./, "").toLowerCase();
    if (target.hostname !== domain && !target.hostname.endsWith("." + domain))
      return [];
  }
  return [
    [
      parts[0],
      ...attributes.filter((attribute) => !/^\s*domain\s*=/i.test(attribute)),
    ].join(";"),
  ];
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
