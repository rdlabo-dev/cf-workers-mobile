// Minimal node:module surface. createRequire resolves .json modules through
// the registered virtual filesystem; executable modules cannot be loaded in
// a bundled WebView runtime and throw explicitly.
import { readFileSync } from "../fs/index.js";
import { builtinModules } from "./builtins.js";
export { builtinModules };
import * as metadata from "./metadata.js";
export * from "./metadata.js";
import { posix } from "node:path";
import { ERR_INVALID_ARG_VALUE } from "../net/errors.js";
export function isBuiltin(specifier: string): boolean {
  if (typeof specifier !== "string") return false;
  if (["node:test", "node:test/reporters", "node:sqlite"].includes(specifier))
    return true;
  const name = specifier.startsWith("node:") ? specifier.slice(5) : specifier;
  return builtinModules.includes(name);
}
export function createRequire(filename: string | URL) {
  const value = String(filename);
  if (!value.startsWith("/") && !value.startsWith("file:"))
    throw new ERR_INVALID_ARG_VALUE(
      "path",
      value,
      "The argument must be a file URL object, a file URL string, or an absolute path string.",
    );
  const pathname = value.startsWith("file:")
    ? decodeURIComponent(new URL(value).pathname)
    : value;
  const directory = posix.dirname(pathname);
  return function require(id: string): unknown {
    if (id.endsWith(".json")) {
      const data = readFileSync(posix.resolve(directory, id), {
        encoding: "utf8",
      });
      return JSON.parse(data as string);
    }
    throw new Error(
      `createRequire cannot load '${id}' in this runtime: executable modules must be bundled.`,
    );
  };
}
// Bundled frameworks may install hooks on Module.prototype.require. Keep the
// constructor mutable, while dynamic executable loading still fails explicitly.
export class Module {
  static builtinModules = builtinModules;
  static isBuiltin = isBuiltin;
  static createRequire = createRequire;
  static Module = Module;
  require(id: string): unknown {
    return createRequire("/")(id);
  }
}
Object.assign(Module, metadata);
export default Module;
