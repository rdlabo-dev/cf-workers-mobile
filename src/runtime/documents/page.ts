import { readDocumentBody, encodeDocumentBytes } from "./body.js";
import "./form-body.js";
import { documentConfig, isDocumentURL } from "./page-config.js";
import { FetchRuntime } from "../fetch/runtime.js";

// Experiment only: keep native document navigation, but carry fetch bytes and
// redirect policy through a script-message bridge before WebKit serializes them.
const nativeFetch = globalThis.fetch;
const host = window as typeof window & {
  webkit: {
    messageHandlers: {
      documentFetch: {
        postMessage(value: unknown): Promise<{
          error?: string;
          status: number;
          headers: Record<string, string>;
          body: string;
          streamId?: string;
          done?: boolean;
        }>;
      };
    };
  };
  documentNativeFetch?: typeof fetch;
};

class PageFetch extends FetchRuntime {
  protected async dispatch(request: Request) {
    const bytes = ["GET", "HEAD"].includes(request.method)
      ? undefined
      : new Uint8Array(await readDocumentBody(request));
    const encoded = bytes ? encodeDocumentBytes(bytes) : undefined;
    const result = await host.webkit.messageHandlers.documentFetch.postMessage({
      url: request.url,
      stream: true,
      method: request.method,
      headers: Object.fromEntries(request.headers),
      ...(encoded === undefined ? {} : { body: encoded }),
    });
    if (result.error) throw new TypeError(result.error);
    const streamId = result.streamId;
    const post = (action: "pull" | "cancel") =>
      host.webkit.messageHandlers.documentFetch.postMessage({
        action,
        streamId,
      });
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    const abort = () => {
      controller?.error(request.signal.reason);
      void post("cancel").catch(() => {});
      request.signal.removeEventListener("abort", abort);
    };
    if (streamId && request.signal.aborted) {
      await post("cancel");
      request.signal.throwIfAborted();
    }
    const body = streamId
      ? new ReadableStream<Uint8Array>(
          {
            start(value) {
              controller = value;
              request.signal.addEventListener("abort", abort, { once: true });
            },
            async pull(value) {
              try {
                const next = await post("pull");
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
                void post("cancel").catch(() => {});
              }
            },
            async cancel() {
              request.signal.removeEventListener("abort", abort);
              await post("cancel");
            },
          },
          { highWaterMark: 0 },
        )
      : null;
    return new Response([204, 205, 304].includes(result.status) ? null : body, {
      status: result.status,
      headers: result.headers,
    });
  }
}
const runtime = new PageFetch({ baseURL: documentConfig.baseURL });
// These own properties model the observable metadata, not browser-internal
// Response slots. clone() must preserve it too. This is not a full Fetch shim.
function metadata(
  response: Response,
  url: string,
  redirected: boolean,
  type: ResponseType,
) {
  const clone = response.clone.bind(response);
  Object.defineProperties(response, {
    url: { value: url },
    redirected: { value: redirected },
    type: { value: type },
    clone: { value: () => metadata(clone(), url, redirected, type) },
  });
  return response;
}
globalThis.fetch = async (input, init) => {
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    document.baseURI,
  );
  if (
    url.protocol !== location.protocol ||
    url.host !== location.host ||
    !isDocumentURL(url)
  )
    return nativeFetch.call(globalThis, input, init);
  let request =
    input instanceof Request
      ? new Request(input, init)
      : new Request(url, init);
  let current = url;
  for (let redirects = 0; ; redirects++) {
    const response = await runtime.fetch(request.clone());
    if (![301, 302, 303, 307, 308].includes(response.status))
      return metadata(response, current.href, redirects > 0, "basic");
    if (request.redirect === "error") {
      await response.body?.cancel();
      throw new TypeError("Redirect disallowed");
    }
    if (request.redirect === "manual") {
      await response.body?.cancel();
      return metadata(Response.error(), current.href, false, "opaqueredirect");
    }
    const locationHeader = response.headers.get("location");
    if (!locationHeader)
      return metadata(response, current.href, redirects > 0, "basic");
    await response.body?.cancel();
    if (redirects >= 20) throw new TypeError("Too many redirects");
    // Worker absolute URLs refer to the same local application.
    const target = new URL(
      locationHeader,
      documentConfig.baseURL + current.pathname + current.search,
    );
    if (
      target.origin !== documentConfig.baseURL ||
      target.username ||
      target.password
    )
      throw new TypeError("External redirects are outside this experiment");
    current = new URL(
      location.protocol +
        "//" +
        location.host +
        target.pathname +
        target.search +
        target.hash,
    );
    const becomesGET =
      ([301, 302].includes(response.status) && request.method === "POST") ||
      (response.status === 303 && !["GET", "HEAD"].includes(request.method));
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
    request = new Request(current, {
      method: becomesGET ? "GET" : request.method,
      headers,
      body:
        becomesGET || ["GET", "HEAD"].includes(request.method)
          ? undefined
          : await readDocumentBody(request),
      signal: request.signal,
      redirect: request.redirect,
    });
  }
};
