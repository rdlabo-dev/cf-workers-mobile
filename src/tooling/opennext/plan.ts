import type { LocalRoute } from "../../cloudflare/bindings/config.js";
import { permitsPath } from "../route-permissions.js";

export function planRoutes(
  paths: Record<string, string>,
  permissions: readonly LocalRoute[],
  middleware: readonly string[],
) {
  return Object.entries(paths).map(([registration, file]) => {
    const path = registration.replace(/\/(page|route)$/, "") || "/";
    const selected = permissions.some(
      (permission) =>
        (permission.method === "GET" || permission.method === "*") &&
        permitsPath(permission, path),
    );
    const dynamic = /[\[\]()@]/.test(path) || path.startsWith("/_");
    const protectedRoute = middleware.some((pattern) =>
      new RegExp(pattern).test(path),
    );
    const reason = !selected
      ? "Route distribution was not permitted by execution"
      : dynamic
        ? "Dynamic, grouped and framework-internal routes require remote execution"
        : protectedRoute
          ? "Matching middleware requires remote execution"
          : "Ordinary GET rendering explicitly permitted; protocol requests remain remote";
    return {
      path,
      file,
      remote: !selected || dynamic || protectedRoute,
      reason,
    };
  });
}

/** No request replay: select the backend before invoking either implementation. */
export function selector(paths: string[]) {
  return `export function needsRemote(request) {
    const url = new URL(request.url);
    return request.method !== "GET" || !${JSON.stringify(paths)}.includes(url.pathname) ||
      url.searchParams.has("_rsc") ||
      ["cookie", "authorization", "rsc", "next-action", "next-router-state-tree",
       "next-router-prefetch", "next-router-segment-prefetch", "next-url", "x-nextjs-data",
       "x-prerender-revalidate", "x-prerender-revalidate-if-generated", "x-middleware-prefetch",
       "x-middleware-subrequest"]
       .some(name => request.headers.has(name));
  }`;
}
