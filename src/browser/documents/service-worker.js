// Native Android document transport. Bundled assets bypass the Worker router.
// Persist shutdown across SW idle termination while an old page is still controlled.
const lifecycleCache = "workers-capacitor-document-lifecycle";
const disabledKey = new URL("/workers-capacitor-disabled", self.location.href)
  .href;
let disabled = false;
self.addEventListener("message", (event) => {
  if (
    ![
      "workers-capacitor:disable-documents",
      "workers-capacitor:enable-documents",
    ].includes(event.data)
  )
    return;
  disabled = event.data === "workers-capacitor:disable-documents";
  const stopping = disabled;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(lifecycleCache);
      if (stopping) await cache.put(disabledKey, new Response("disabled"));
      else await cache.delete(disabledKey);
      event.ports[0]?.postMessage("done");
    })(),
  );
});
const baseURL = new URL(self.location.href).searchParams.get("baseURL");
// Read the current manifest: a previously installed SW can outlive an app update.
function assets() {
  return fetch("/workers-capacitor-assets.json", { cache: "no-store" }).then(
    (response) => {
      if (!response.ok) throw new Error("Missing document assets manifest");
      return response.json();
    },
  );
}
// Android's native interceptor cannot expose request bodies or return redirects.
// Keep those semantics in the browser's standard FetchEvent pipeline.
self.addEventListener("install", (event) =>
  event.waitUntil(self.skipWaiting()),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  if (disabled) return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      if (await (await caches.open(lifecycleCache)).match(disabledKey))
        return fetch(event.request);
      const paths = await assets();
      if (disabled) return fetch(event.request);
      if (
        paths.includes(url.pathname) ||
        url.pathname.startsWith("/_capacitor_")
      )
        return fetch(event.request);
      return dispatch(event.request);
    })(),
  );
});
async function dispatch(request) {
  const deadline = Date.now() + 10000;
  let host = (
    await self.clients.matchAll({ type: "window", includeUncontrolled: true })
  ).find((client) =>
    new URL(client.url).searchParams.has("__workers_capacitor_host"),
  );
  // An installed SW survives process restarts. Let the bundled entry restart the
  // native host before intercepting its first document, without a network server.
  if (!host && request.mode === "navigate" && request.method === "GET")
    return fetch(new URL("/index.html", self.location.origin).href, {
      cache: "no-store",
    });
  while (!host) {
    host = (
      await self.clients.matchAll({ type: "window", includeUncontrolled: true })
    ).find((client) =>
      new URL(client.url).searchParams.has("__workers_capacitor_host"),
    );
    if (Date.now() > deadline) throw new Error("Worker host unavailable");
    if (!host) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await readUpload(request);
  const message = {
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers),
    body,
    stream: true,
  };
  const rpc = (message) =>
    new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => {
        channel.port1.close();
        reject(new Error("Worker response timeout"));
      }, 30000);
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        channel.port1.close();
        resolve(event.data);
      };
      host.postMessage(message, [channel.port2]);
    });
  const result = await rpc(message);
  const cancel = () => rpc({ action: "cancel", streamId: result.streamId });
  if (result.error) throw new Error(result.error);
  const headers = new Headers(result.headers);
  if (
    [301, 302, 303, 307, 308].includes(result.status) &&
    headers.has("location")
  ) {
    const target = new URL(headers.get("location"), result.url);
    if (target.origin !== baseURL) {
      if (result.streamId) await cancel();
      throw new Error("External redirects are not supported");
    }
    headers.set(
      "location",
      self.location.origin + target.pathname + target.search + target.hash,
    );
  }
  let controller;
  const abort = () => {
    controller?.error(request.signal.reason);
    void cancel().catch(() => {});
  };
  const responseBody = result.streamId
    ? new ReadableStream(
        {
          start(value) {
            controller = value;
            request.signal.addEventListener("abort", abort, { once: true });
          },
          async pull(value) {
            try {
              const next = await rpc({
                action: "pull",
                streamId: result.streamId,
              });
              if (request.signal.aborted) return;
              if (next.error) throw new Error(next.error);
              if (next.done) {
                request.signal.removeEventListener("abort", abort);
                value.close();
              } else
                value.enqueue(
                  Uint8Array.from(atob(next.body), (c) => c.charCodeAt(0)),
                );
            } catch (error) {
              request.signal.removeEventListener("abort", abort);
              value.error(error);
              void cancel().catch(() => {});
            }
          },
          async cancel() {
            request.signal.removeEventListener("abort", abort);
            await cancel();
          },
        },
        { highWaterMark: 0 },
      )
    : result.body;
  if (result.streamId && request.signal.aborted) {
    await cancel();
    request.signal.throwIfAborted();
  }
  return new Response(
    [101, 204, 205, 304].includes(result.status) ? null : responseBody,
    { status: result.status, headers },
  );
}

async function readUpload(request) {
  const reader = request.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      request.signal.throwIfAborted();
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 8 * 1024 * 1024)
        throw new RangeError("Document upload exceeds 8 MiB");
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes.buffer;
  } catch (error) {
    void reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
