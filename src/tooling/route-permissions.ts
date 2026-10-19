import type { LocalRoute } from "../cloudflare/bindings/config.js";

/** Permissions match registration text, never an incoming URL. */
export function permitsPath(permission: LocalRoute, path: string | undefined) {
  if (path === undefined) return false;
  const pattern = permission.path;
  if (pattern instanceof RegExp)
    return new RegExp(pattern.source, pattern.flags).test(path);
  if (pattern === path || pattern === "*" || pattern === "/*") return true;
  if (pattern.endsWith("/*") && !/[:*{}?]/.test(pattern.slice(0, -2))) {
    const base = pattern.slice(0, -2);
    return path === base || path.startsWith(base + "/");
  }
  return false;
}
