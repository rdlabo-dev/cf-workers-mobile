import { fileMode } from "./mode.js";
import { registerRequestScope } from "../../shared/request-scope.js";
// Writable, memory-only /tmp. Embedded bundle files remain read-only.
// This adapter does not expose the device filesystem.
import { Volume, createFsFromVolume } from "memfs";
import { Buffer } from "node:buffer";
import { posix } from "node:path";
import { ERR_INVALID_ARG_TYPE } from "../net/errors.js";
import { AsyncLocalStorage } from "../async-hooks/index.js";
export function pathOf(value: any): string {
  if (value instanceof URL) value = decodeURIComponent(value.pathname);
  if (Buffer.isBuffer(value)) value = value.toString();
  if (typeof value !== "string")
    throw new ERR_INVALID_ARG_TYPE("path", ["string", "Buffer", "URL"], value);
  return posix.resolve("/bundle", value);
}
export function temporaryPath(value: any): boolean {
  if (typeof value === "number") return true;
  const path = pathOf(value);
  return path === "/tmp" || path.startsWith("/tmp/");
}
export function writablePath(value: any, syscall: string) {
  if (typeof value === "number") return value;
  const path = pathOf(value);
  if (!(path === "/tmp" || path.startsWith("/tmp/")))
    throw Object.assign(
      new Error(`EROFS: read-only file system, ${syscall} '${path}'`),
      { code: "EROFS", errno: -30, syscall, path },
    );
  return path;
}

function createTemporary() {
  const volume = new Volume();
  volume.mkdirSync("/tmp");
  const fs = createFsFromVolume(volume) as any;
  const mutating = new Set([
    "appendFile",
    "writeFile",
    "mkdir",
    "mkdtemp",
    "rm",
    "rmdir",
    "unlink",
    "truncate",
    "utimes",
    "lutimes",
    "chmod",
    "chown",
    "lchmod",
    "lchown",
  ]);
  const api: any = {};
  for (const name of Object.keys(fs)) {
    if (typeof fs[name] !== "function") {
      api[name] = fs[name];
      continue;
    }
    if (/^[A-Z]/.test(name)) {
      api[name] = fs[name];
      continue;
    }
    const base = name.replace(/Sync$/, "");
    api[name] = (...args: any[]) => {
      try {
        if (
          ["writeFile", "appendFile"].includes(base) &&
          typeof args[0] !== "number"
        ) {
          const opts = args[2];
          if (typeof opts === "object" && opts !== null) {
            fileMode(opts.mode, 0o666);
            args[2] = { ...opts, mode: 0o666 };
          } else if (typeof opts === "function")
            args.splice(2, 0, { mode: 0o666 });
          else if (opts === undefined || typeof opts === "string")
            args[2] = {
              mode: 0o666,
              ...(typeof opts === "string" ? { encoding: opts } : {}),
            };
        }
        if (base === "symlink") {
          args[1] = writablePath(args[1], base);
          const target = Buffer.isBuffer(args[0])
            ? args[0].toString()
            : args[0];
          if (typeof target !== "string")
            throw new ERR_INVALID_ARG_TYPE(
              "target",
              ["string", "Buffer"],
              target,
            );
          writablePath(posix.resolve(posix.dirname(args[1]), target), base);
        } else if (["rename", "copyFile", "cp", "link"].includes(base)) {
          args[0] = writablePath(args[0], base);
          args[1] = writablePath(args[1], base);
        } else if (
          mutating.has(base) ||
          base === "open" ||
          base === "createWriteStream"
        )
          args[0] = writablePath(args[0], base);
        else if (
          typeof args[0] === "string" ||
          args[0] instanceof URL ||
          Buffer.isBuffer(args[0])
        )
          args[0] = pathOf(args[0]);
      } catch (error) {
        const callback = args[args.length - 1];
        if (!name.endsWith("Sync") && typeof callback === "function") {
          queueMicrotask(() => callback(error));
          return;
        }
        throw error;
      }
      return fs[name](...args);
    };
  }
  return {
    api,
    clear() {
      for (const name of fs.readdirSync("/tmp"))
        fs.rmSync(`/tmp/${name}`, { recursive: true, force: true });
    },
  };
}

const contexts = new AsyncLocalStorage<ReturnType<typeof createTemporary>>();
const fallback = createTemporary();
const active = () => contexts.getStore() ?? fallback;
export const temporary: any = new Proxy(
  {},
  {
    get(_target, name) {
      return active().api[name];
    },
    ownKeys() {
      return Reflect.ownKeys(fallback.api);
    },
    getOwnPropertyDescriptor() {
      return { enumerable: true, configurable: true };
    },
  },
);
export function clearTemporaryFiles() {
  active().clear();
}
export function runWithTemporaryFiles<T>(callback: () => T): T {
  return contexts.run(createTemporary(), callback);
}

registerRequestScope(runWithTemporaryFiles);
