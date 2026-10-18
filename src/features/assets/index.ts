import { platform } from "../../compat/globals/platform.js";
import {
  Request as WorkerRequest,
  type RequestInit as WorkerRequestInit,
} from "../../compat/request/index.js";
import { Response as WorkerResponse } from "../../compat/response/index.js";

export interface LocalAssetsOptions {
  /** URL within the app's static asset origin, e.g. new URL('.', import.meta.url). */
  baseURL: string | URL;
  /** Match Wrangler's assets.not_found_handling. No HTML canonicalization. */
  notFoundHandling?: "none" | "single-page-application";
}

/**
 * Exact-path ASSETS binding for explicitly packaged public files. Fetches only
 * the selected file and streams its body; it never embeds or preloads all bytes.
 * Supply through runtime env (direct execution), just like LocalStorageKV.
 */
export class LocalAssets {
  private readonly files = new Map<string, string>();
  private readonly spa: boolean;
  constructor(
    files: Record<string, string | URL>,
    options: LocalAssetsOptions,
  ) {
    const base = new URL(options.baseURL);
    if (
      !base.host ||
      base.username ||
      base.password ||
      !["http:", "https:", "capacitor:"].includes(base.protocol)
    )
      throw new TypeError(
        "LocalAssets.baseURL must be an app asset URL without credentials",
      );
    if (
      options.notFoundHandling !== undefined &&
      !["none", "single-page-application"].includes(options.notFoundHandling)
    )
      throw new TypeError("Invalid LocalAssets.notFoundHandling");
    this.spa = options.notFoundHandling === "single-page-application";
    for (const [path, value] of Object.entries(files)) {
      // Keys are literal URL pathnames, including percent encoding. A manifest is
      // an allowlist, not an arbitrary path-to-filesystem or network proxy.
      const key = new URL(path, "https://assets.invalid");
      if (
        !path.startsWith("/") ||
        key.pathname !== path ||
        key.host !== "assets.invalid" ||
        key.search ||
        key.hash ||
        /%(?:2f|5c|00)/i.test(path)
      )
        throw new TypeError(`Invalid LocalAssets path: ${path}`);
      const url = new URL(value, base);
      if (
        url.protocol !== base.protocol ||
        url.host !== base.host ||
        url.username ||
        url.password ||
        url.hash
      )
        throw new TypeError(
          `LocalAssets file must stay within the app asset origin: ${path}`,
        );
      this.files.set(path, url.href);
    }
    if (this.spa && !this.files.has("/index.html"))
      throw new TypeError("SPA assets require /index.html in the manifest");
  }

  async fetch(
    input: Request | URL | string,
    init?: RequestInit,
  ): Promise<Response> {
    const request = new WorkerRequest(input, init as WorkerRequestInit);
    request.signal.throwIfAborted();
    const respond = (
      body: ReadableStream<Uint8Array> | null,
      status: number,
      headers?: HeadersInit,
    ) =>
      new WorkerResponse(body, {
        status,
        headers: headers as never,
      }) as unknown as Response;
    if (!["GET", "HEAD"].includes(request.method))
      return respond(null, 405, { allow: "GET, HEAD" });
    // These need a specified representation/validator contract; do not return a
    // misleading 200 when the caller requested range or conditional semantics.
    for (const name of [
      "range",
      "if-range",
      "if-match",
      "if-none-match",
      "if-modified-since",
      "if-unmodified-since",
    ])
      if (request.headers.has(name))
        throw new TypeError(
          `LocalAssets does not support ${name}; use remote assets for conditional/range requests`,
        );
    const pathname = new URL(request.url).pathname;
    const url =
      this.files.get(pathname) ??
      (this.spa ? this.files.get("/index.html") : undefined);
    if (!url) return respond(null, 404);
    // Capture original platform fetch, bypassing Worker routing. No caller
    // Authorization, cookies, query, or user-controlled host is forwarded.
    const response = await platform.fetch(url, {
      method: request.method,
      credentials: "omit",
      redirect: "error",
      signal: request.signal,
      cache: "no-store",
    });
    if (request.signal.aborted || response.status !== 200) {
      await response.body?.cancel().catch(() => {});
      request.signal.throwIfAborted();
      throw new Error(
        `Packaged asset unavailable (${response.status}): ${pathname}`,
      );
    }
    const headers = new platform.Headers(response.headers);
    headers.delete("set-cookie");
    headers.delete("etag");
    headers.delete("last-modified");
    headers.delete("accept-ranges");
    headers.set("cache-control", "no-store");
    // Fetch exposes decoded bytes; host content encoding/length may describe the
    // wire representation, not this response's stream.
    headers.delete("content-encoding");
    if (request.method !== "HEAD") headers.delete("content-length");
    if (request.method === "HEAD") {
      await response.body?.cancel();
      return respond(null, 200, headers);
    }
    return respond(response.body, 200, headers);
  }
}
