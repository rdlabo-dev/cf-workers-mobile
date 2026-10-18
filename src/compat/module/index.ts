// Minimal node:module surface. createRequire resolves .json modules through
// the registered virtual filesystem; executable modules cannot be loaded in
// a bundled WebView runtime and throw explicitly.
import { readFileSync } from "../fs/index.js";
export const builtinModules = [
  "async_hooks",
  "buffer",
  "fs",
  "fs/promises",
  "http",
  "module",
  "net",
  "path",
  "querystring",
  "stream",
  "stream/web",
  "string_decoder",
  "util",
];
export function isBuiltin(specifier: string): boolean {
  const name = specifier.startsWith("node:")
    ? specifier.slice(5)
    : specifier;
  return builtinModules.includes(name);
}
export function createRequire(_filename: string | URL) {
  return function require(id: string): unknown {
    if (id.endsWith(".json")) {
      const data = readFileSync(id, { encoding: "utf8" });
      return JSON.parse(data as string);
    }
    throw new Error(
      `createRequire cannot load '${id}' in this runtime: executable modules must be bundled.`,
    );
  };
}
export default { builtinModules, isBuiltin, createRequire };
