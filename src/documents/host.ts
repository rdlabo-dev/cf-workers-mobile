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
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export function installDocumentHost(runtime: DocumentRuntime, baseURL: string) {
  const host = globalThis as typeof globalThis & {
    __capacitorWorkersDispatch?: typeof nativeDispatch;
  };
  if (host.__capacitorWorkersDispatch)
    throw new Error("Document host is already installed");
  async function dispatch(request: DocumentRequest) {
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
      }),
    );
    const resultHeaders = new Headers(response.headers);
    resultHeaders.set("cache-control", "no-store");
    return {
      url: target,
      status: response.status,
      headers: Object.fromEntries(resultHeaders),
      body: await response.arrayBuffer(),
    };
  }
  async function nativeDispatch(
    input: Omit<DocumentRequest, "body"> & {
      body?: string;
      document?: boolean;
      follow?: boolean;
      redirectCount?: number;
    },
  ) {
    let request: DocumentRequest = {
      ...input,
      body:
        input.body === undefined
          ? undefined
          : Uint8Array.from(atob(input.body), (c) => c.charCodeAt(0)).buffer,
    };
    for (let count = 0; ; count++) {
      const result = await dispatch(request);
      const locationHeader = result.headers.location;
      if (
        !redirects.includes(result.status) ||
        !locationHeader ||
        (!input.follow && !input.document)
      )
        return { ...result, body: encode(result.body) };
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
          body: encode(result.body),
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
  }
  const message = async (event: MessageEvent<DocumentRequest>) => {
    const port = event.ports[0];
    if (!port) return;
    try {
      port.postMessage(await dispatch(event.data));
    } catch (error) {
      port.postMessage({ error: String(error) });
    } finally {
      port.close();
    }
  };
  host.__capacitorWorkersDispatch = nativeDispatch;
  globalThis.navigator?.serviceWorker?.addEventListener("message", message);
  return () => {
    if (host.__capacitorWorkersDispatch === nativeDispatch)
      delete host.__capacitorWorkersDispatch;
    globalThis.navigator?.serviceWorker?.removeEventListener(
      "message",
      message,
    );
  };
}
