import { platform } from "../../shared/globals/platform.js";
import { Request, type RequestInit } from "../request/index.js";
import { Response, networkResponse } from "../response/index.js";

export function isRequest(
  input: unknown,
): input is Request | globalThis.Request {
  return input instanceof Request || input instanceof platform.Request;
}
export function isResponse(
  input: unknown,
): input is Response | globalThis.Response {
  return input instanceof Response || input instanceof platform.Response;
}
/** Browser fallback keeps browser network restrictions and platform-owned assets. */
export async function browserFetch(
  input: string | URL | Request | globalThis.Request,
  init?: RequestInit,
  fetcher = platform.fetch,
): Promise<Response> {
  let response: globalThis.Response;
  let method: string;
  if (input instanceof platform.Request) {
    method = init?.method ?? input.method;
    response = await fetcher(input, init as globalThis.RequestInit);
  } else {
    const resolved =
      typeof input === "string"
        ? new URL(
            input,
            globalThis.document?.baseURI ?? globalThis.location?.href,
          )
        : input;
    const request = new Request(resolved, init);
    method = request.method;
    response = await fetcher(request.url, {
      method: request.method,
      headers: [...request.headers],
      body: request.body,
      signal: request.signal,
      redirect: request.redirect,
      ...(request.cache ? { cache: request.cache as RequestCache } : {}),
      // Ignored by browsers; required by Node's standards-based test transport.
      duplex: "half",
    } as globalThis.RequestInit);
  }
  if (response.type === "error" || response.status === 0)
    return Response.error();
  // WebKit can expose an empty ReadableStream for a network 204/205/304 or
  // HEAD response. Workers Response correctly forbids bodies for these cases.
  const nullBody =
    method.toUpperCase() === "HEAD" ||
    [204, 205, 304].includes(response.status);
  if (nullBody) void response.body?.cancel().catch(() => {});
  return networkResponse(
    nullBody ? null : response.body,
    {
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers],
    },
    response.url,
    response.redirected,
  );
}
