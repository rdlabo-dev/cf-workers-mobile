/// <reference types="vite/client" />
import { workersCapacitor } from "cf-workers-mobile/capacitor";

// This Window is an offscreen runtime host, not the rendered application.
// Keeping it alive lets the visible WebView use real document navigation.
const framework =
  new URLSearchParams(location.search).get("framework") ?? import.meta.env.MODE;
const runtime = workersCapacitor({
  baseURL: "https://worker.invalid/",
  worker:
    framework === "express"
      ? () =>
          new Worker(new URL("./express-entry.ts", import.meta.url), {
            type: "module",
          })
      : () =>
          new Worker(new URL("./hono-entry.ts", import.meta.url), {
            type: "module",
          }),
});
const host = window as typeof window & {
  NativeDocuments?: { reply(value: string): void };
  webkit?: {
    messageHandlers: { documents: { postMessage(value: string): void } };
  };
  dispatchDocument?: (request: {
    id: string;
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
    document?: boolean;
  }) => Promise<void>;
};
function reply(value: unknown) {
  const json = JSON.stringify(value);
  if (host.NativeDocuments) host.NativeDocuments.reply(json);
  else host.webkit!.messageHandlers.documents.postMessage(json);
}
function base64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
type DocumentRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: ArrayBuffer;
};
async function dispatch({ url, method, headers, body }: DocumentRequest) {
  await runtime.ready;
  const requested = new URL(url);
  const forwardedHeaders = new Headers(headers);
  forwardedHeaders.delete("if-none-match");
  forwardedHeaders.delete("if-modified-since");
  const target =
    "https://worker.invalid" + requested.pathname + requested.search;
  const response = await fetch(
    new Request(target, {
      method,
      headers: forwardedHeaders,
      body,
      redirect: "manual",
    }),
  );
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("cache-control", "no-store");
  return {
    url: target,
    status: response.status,
    headers: Object.fromEntries(responseHeaders),
    body: await response.arrayBuffer(),
  };
}
// WKURLSchemeTask has no Fetch redirect-mode information. For subresources,
// this experiment supports same-origin default-follow behavior only.
async function dispatchFollowing(request: DocumentRequest) {
  for (let redirects = 0; ; redirects++) {
    const result = await dispatch(request);
    const location = result.headers["location"];
    if (![301, 302, 303, 307, 308].includes(result.status) || !location)
      return result;
    if (redirects >= 20) throw new Error("Too many redirects");
    const target = new URL(location, result.url);
    if (target.origin !== "https://worker.invalid")
      throw new Error("External redirects are outside this experiment");
    const headers = new Headers(request.headers);
    const becomesGET =
      ((result.status === 301 || result.status === 302) &&
        request.method === "POST") ||
      (result.status === 303 && !["GET", "HEAD"].includes(request.method));
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
      headers: Object.fromEntries(headers),
      method: becomesGET ? "GET" : request.method,
      body: becomesGET ? undefined : request.body,
    };
  }
}
// Service Worker requests retain browser-level redirect/form semantics on Android.
navigator.serviceWorker?.addEventListener("message", async (event) => {
  const port = event.ports[0];
  if (!port) return;
  try {
    port.postMessage(await dispatch(event.data));
  } catch (error) {
    port.postMessage({ error: String(error) });
  } finally {
    port.close();
  }
});
(window as any).dispatchPageFetch = async ({
  id,
  body,
  ...request
}: { id?: string; body?: string } & Omit<DocumentRequest, "body">) => {
  try {
    const bytes =
      body === undefined
        ? undefined
        : Uint8Array.from(atob(body), (char) => char.charCodeAt(0)).buffer;
    const result = await dispatch({ ...request, body: bytes });
    const encoded = { ...result, body: base64(new Uint8Array(result.body)) };
    if (id) reply({ ...encoded, fetchId: id });
    return encoded;
  } catch (error) {
    if (id) reply({ fetchId: id, error: String(error) });
    return { error: String(error) };
  }
};
host.dispatchDocument = async ({ id, body, document, ...request }) => {
  try {
    const bytes =
      body === undefined
        ? undefined
        : Uint8Array.from(atob(body), (char) => char.charCodeAt(0)).buffer;
    const result = await (document ? dispatch : dispatchFollowing)({
      ...request,
      body: bytes,
    });
    const headers = new Headers(result.headers);
    if (headers.has("location")) {
      const target = new URL(headers.get("location")!, result.url);
      if (target.origin !== "https://worker.invalid")
        throw new Error("External redirects are outside this experiment");
      const local = new URL(request.url);
      headers.set(
        "location",
        local.protocol +
          "//" +
          local.host +
          target.pathname +
          target.search +
          target.hash,
      );
    }
    reply({
      ...result,
      id,
      headers: Object.fromEntries(headers),
      body: base64(new Uint8Array(result.body)),
    });
  } catch (error) {
    reply({
      id,
      status: 502,
      headers: { "content-type": "text/plain" },
      body: base64(new TextEncoder().encode(String(error))),
    });
  }
};
await runtime.ready;
if (host.NativeDocuments || host.webkit?.messageHandlers?.documents)
  reply({ ready: true });
