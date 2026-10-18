import { platform } from "../globals/platform.js";
import { hasBody, inheritBodySource } from "../body/index.js";
import {
  Body,
  dictionary,
  webString,
  cloneValue,
  cloneBody,
  moveBody,
} from "../body/index.js";
import { Headers, type HeadersInit } from "../headers/index.js";

const methods = new Set(
  "ACL CHECKOUT COPY DELETE GET HEAD LOCK MERGE MKACTIVITY MKCOL MOVE NOTIFY OPTIONS PATCH POST PROPFIND PROPPATCH PURGE PUT QUERY REPORT SEARCH SUBSCRIBE TRACE UNLOCK UNSUBSCRIBE".split(
    " ",
  ),
);
export interface RequestInit {
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  redirect?: string;
  signal?: AbortSignal | null;
  cf?: Record<string, unknown>;
  fetcher?: { fetch(input: unknown, init?: unknown): Promise<unknown> } | null;
  cache?: string;
  integrity?: string;
  keepalive?: boolean;
  encodeResponseBody?: "automatic" | "manual";
}
export interface StructuredCloneRequestSnapshot {
  url: string;
  method: string;
  headers: Headers;
  redirect: "follow" | "manual";
  signal: AbortSignal | undefined;
  cf: Record<string, unknown> | undefined;
  fetcher: RequestInit["fetcher"];
  cache: "no-store" | "no-cache" | undefined;
  hasBody: boolean;
  encodeResponseBody: "automatic" | "manual";
}
export let structuredCloneRequestSnapshot: (
  request: Request,
) => StructuredCloneRequestSnapshot;
const encodings = new WeakMap<Request, "automatic" | "manual">();
export function requestEncoding(request: Request) {
  return encodings.get(request)!;
}
export class Request extends Body {
  #url: string;
  #method: string;
  #headers: Headers;
  #redirect: "follow" | "manual";
  #signal: AbortSignal | undefined;
  #thisSignal: AbortSignal | undefined;
  #cf: Record<string, unknown> | undefined;
  #fetcher: RequestInit["fetcher"];
  #cache: "no-store" | "no-cache" | undefined;
  static {
    structuredCloneRequestSnapshot = (request) => ({
      url: request.#url,
      method: request.#method,
      headers: request.#headers,
      redirect: request.#redirect,
      signal: request.#signal,
      cf: request.#cf,
      fetcher: request.#fetcher,
      cache: request.#cache,
      hasBody: hasBody(request),
      encodeResponseBody: requestEncoding(request),
    });
  }
  constructor(
    input: string | URL | Request | globalThis.Request,
    init: RequestInit = {},
  ) {
    init = dictionary(init);
    if (init instanceof Request) {
      init = {
        method: init.method,
        headers: init.headers,
        body: init.body,
        redirect: init.redirect,
        signal: init.signal,
        cache: init.cache,
        cf: init.cf,
        fetcher: init.fetcher,
        encodeResponseBody: requestEncoding(init),
      };
    }
    if (arguments.length === 0)
      throw new TypeError("Request requires an input.");
    let nativeSource: globalThis.Request | undefined;
    if (input instanceof platform.Request) {
      // Requests created before installation retain their platform brand.
      // Transfer only if the caller did not explicitly replace the body.
      const native = input;
      if (init.body === undefined) nativeSource = native;
      const body = init.body !== undefined ? init.body : native.body;
      init = {
        method: native.method,
        headers: [...native.headers],
        redirect: native.redirect,
        signal: native.signal,
        cache:
          native.cache === "no-cache" || native.cache === "no-store"
            ? native.cache
            : undefined,
        ...init,
        body,
      };
      input = native.url;
    }
    const original = input instanceof Request ? input : undefined;
    const url = original ? original.url : new URL(webString(input)).href;
    const method = String(
      init.method ?? original?.method ?? "GET",
    ).toUpperCase();
    if (!methods.has(method))
      throw new TypeError(`Invalid HTTP method string: ${init.method}`);
    if (init.integrity !== undefined && String(init.integrity) !== "")
      throw new TypeError(
        "Subrequest integrity checking is not implemented. The integrity option must be either undefined or an empty string.",
      );
    const redirect = String(
      init.redirect ?? original?.redirect ?? "follow",
    ).toLowerCase();
    if (redirect !== "follow" && redirect !== "manual")
      throw new TypeError(
        "Invalid redirect value, must be one of follow or manual.",
      );
    const cache = init.cache ?? original?.cache;
    if (cache !== undefined && cache !== "no-store" && cache !== "no-cache")
      throw new TypeError(`Unsupported cache mode: ${cache}`);
    if (
      init.encodeResponseBody !== undefined &&
      !["automatic", "manual"].includes(init.encodeResponseBody)
    )
      throw new TypeError(
        `encodeResponseBody: unexpected value: ${init.encodeResponseBody}`,
      );
    const signal =
      init.signal === undefined
        ? original
          ? original.#signal
          : undefined
        : init.signal;
    if (signal != null && !(signal instanceof AbortSignal))
      throw new TypeError("signal must be an AbortSignal");
    const cf = cloneValue(init.cf === undefined ? original?.cf : init.cf);
    const headers = new Headers(init.headers ?? original?.headers);
    let body =
      init.body !== undefined
        ? init.body
        : original
          ? original.body
          : undefined;
    if (body != null && (method === "GET" || method === "HEAD"))
      throw new TypeError(
        "Request with a GET or HEAD method cannot have a body.",
      );
    // Transfer only after all initializer validation succeeds.
    if (nativeSource?.body) body = new platform.Request(nativeSource).body;
    else if (original && init.body === undefined) body = moveBody(original);
    super(body, headers);
    if (original && init.body === undefined) inheritBodySource(this, original);
    encodings.set(this, init.encodeResponseBody ?? "automatic");
    this.#url = url;
    this.#method = method;
    this.#headers = headers;
    this.#redirect = redirect;
    this.#signal = signal ?? undefined;
    this.#cf = cf;
    this.#fetcher =
      init.fetcher === undefined ? (original?.fetcher ?? null) : init.fetcher;
    this.#cache = cache;
  }
  get url() {
    return this.#url;
  }
  get method() {
    return this.#method;
  }
  get headers() {
    return this.#headers;
  }
  get redirect() {
    return this.#redirect;
  }
  get signal() {
    return this.#signal ?? (this.#thisSignal ??= new AbortController().signal);
  }
  get cf() {
    return this.#cf;
  }
  get fetcher() {
    return this.#fetcher;
  }
  get cache() {
    return this.#cache;
  }
  get integrity() {
    return "";
  }
  get keepalive() {
    return false;
  }
  clone(): Request {
    const copy = new Request(this.url, {
      method: this.method,
      headers: this.headers,
      redirect: this.redirect,
      signal: this.#signal,
      cf: this.cf,
      fetcher: this.fetcher,
      cache: this.cache,
      body: cloneBody(this),
      encodeResponseBody: requestEncoding(this),
    });
    inheritBodySource(copy, this);
    return copy;
  }
}
Object.defineProperty(Request, "name", {
  value: "Request",
  configurable: true,
});
Object.defineProperty(Request, "length", { value: 1, configurable: true });
Object.defineProperty(Request.prototype, Symbol.toStringTag, {
  value: "Request",
  writable: true,
  configurable: true,
});
for (const key of Object.getOwnPropertyNames(Request.prototype))
  if (key !== "constructor")
    Object.defineProperty(Request.prototype, key, { enumerable: true });
