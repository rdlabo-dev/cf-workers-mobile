import type { SecureClient, SecureClientOptions } from "./types.js";

export function createSecureClient(options: SecureClientOptions): SecureClient {
  const base = new URL(options.baseURL);
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new TypeError(
      "baseURL must be an HTTPS URL without credentials, query or fragment",
    );
  const root = base.pathname.endsWith("/")
    ? base.pathname
    : `${base.pathname}/`;
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

  return {
    async fetch(input, init) {
      const address = input instanceof Request ? input.url : String(input);
      if (address.startsWith("//"))
        throw new TypeError("Protocol-relative API URLs are not allowed");
      const url = new URL(
        URL.canParse(address) ? address : address.replace(/^\/+/, ""),
        base.origin + root,
      );
      if (
        url.origin !== base.origin ||
        (url.pathname !== root.slice(0, -1) &&
          !url.pathname.startsWith(root)) ||
        url.username ||
        url.password
      )
        throw new TypeError("Request must stay within the configured API root");

      // Preserve Request bodies, signals and headers without mutating the input.
      const original =
        input instanceof Request
          ? new Request(input.clone(), init)
          : new Request(url, init);
      const headers = new Headers(original.headers);
      const token = await options.authProvider?.getToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const request = new Request(
        url,
        new Request(original, {
          headers,
          credentials: options.credentials ?? original.credentials,
          // Do not forward credentials to redirects without explicit caller review.
          redirect: "manual",
        }),
      );
      return doFetch(request);
    },
  };
}
