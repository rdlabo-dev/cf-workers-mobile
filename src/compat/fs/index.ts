import { fileMode } from "./mode.js";
import { validateInteger } from "../crypto/validation.js";
import * as embedded from "./embedded.js";
import {
  temporary,
  temporaryPath,
  clearTemporaryFiles,
  writablePath,
  pathOf,
} from "./writable.js";
import { Buffer } from "node:buffer";
import {
  validateFunction,
  validateObject,
  validateBoolean,
} from "../net/validators.js";
export const registerVirtualFiles = embedded.registerVirtualFiles;
export function clearVirtualFiles() {
  embedded.clearVirtualFiles();
  clearTemporaryFiles();
}
const reads = new Set([
  "readFileSync",
  "readFile",
  "readdirSync",
  "readdir",
  "statSync",
  "stat",
  "lstatSync",
  "realpathSync",
  "existsSync",
]);
const api: any = { ...temporary };
for (const name of Object.keys(api))
  if (typeof api[name] === "function" && /^[a-z]/.test(name))
    api[name] = (...args: any[]) => temporary[name](...args);
for (const name of [
  "ReadStream",
  "WriteStream",
  "FileReadStream",
  "FileWriteStream",
]) {
  api[name] = new Proxy(api[name], {
    construct(_target, args) {
      args[0] = writablePath(args[0], name);
      return Reflect.construct(temporary[name], args);
    },
  });
}
for (const name of reads) {
  const old = (embedded as any)[name];
  api[name] = (...args: any[]) =>
    temporaryPath(args[0]) ? temporary[name](...args) : old(...args);
}
for (const name of ["watch", "watchFile", "unwatchFile"])
  api[name] = () => {
    throw Object.assign(new Error("The operation is not supported"), {
      code: "ERR_UNSUPPORTED_OPERATION",
    });
  };
// Workers reports the byte count from these synchronous operations.
for (const name of ["writeFileSync", "appendFileSync"])
  api[name] = (...args: any[]) => {
    temporary[name](...args);
    const encoding = typeof args[2] === "string" ? args[2] : args[2]?.encoding;
    return typeof args[1] === "string"
      ? Buffer.byteLength(args[1], encoding)
      : args[1].byteLength;
  };
const promises: any = { ...temporary.promises };
for (const name of Object.keys(promises))
  if (typeof promises[name] === "function" && /^[a-z]/.test(name))
    promises[name] = (...args: any[]) => temporary.promises[name](...args);
for (const name of [
  "readFile",
  "readdir",
  "stat",
  "lstat",
  "realpath",
  "access",
]) {
  const old = (embedded.promises as any)[name];
  promises[name] = (...args: any[]) =>
    temporaryPath(args[0]) ? temporary.promises[name](...args) : old(...args);
}
// Keep all writes inside the memory volume, including FileHandle operations.
for (const name of [
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
  "open",
  "rename",
  "copyFile",
  "cp",
  "link",
  "symlink",
]) {
  promises[name] = async (...args: any[]) => {
    if (name === "symlink") {
      return new Promise((resolve, reject) =>
        temporary.symlink(...args, (error: unknown) =>
          error ? reject(error) : resolve(undefined),
        ),
      );
    }
    const indexes = ["rename", "copyFile", "cp", "link"].includes(name)
      ? [0, 1]
      : [0];
    for (const i of indexes)
      if (
        typeof args[i] !== "object" ||
        args[i] instanceof URL ||
        Buffer.isBuffer(args[i])
      ) {
        if (!temporaryPath(args[i]))
          throw Object.assign(new Error("EROFS: read-only file system"), {
            code: "EROFS",
          });
      }
    return temporary.promises[name](...args);
  };
}
promises.watch = async function* () {
  api.watch();
};
// Workers validates ownership/permission requests but has no mutable Unix
// ownership or permissions. These operations must not change the memory VFS.
function installOperation(
  name: string,
  handler: (...args: any[]) => any,
  promise = true,
) {
  api[name + "Sync"] = handler;
  api[name] = (...args: any[]) => {
    const callback = args.pop();
    validateFunction(callback, "callback");
    Promise.resolve()
      .then(() => handler(...args))
      .then(
        (value) => callback(null, value),
        (error) => callback(error),
      );
  };
  if (promise) promises[name] = async (...args: any[]) => handler(...args);
}
function temporaryStats(stat: any) {
  if (stat == null) return stat;
  const bigint = typeof stat.mode === "bigint";
  const mode = (Number(stat.mode) & ~0o777) | 0o666;
  stat.mode = bigint ? BigInt(mode) : mode;
  stat.uid = stat.gid = bigint ? 0n : 0;
  return stat;
}
for (const name of ["stat", "lstat"])
  installOperation(name, (path: any, options?: any) =>
    temporaryPath(path)
      ? temporaryStats(temporary[name + "Sync"](path, options))
      : embedded.statSync(path),
  );
installOperation(
  "fstat",
  (...args: any[]) => temporaryStats(temporary.fstatSync(...args)),
  false,
);
for (const name of ["chmod", "lchmod", "fchmod", "chown", "lchown", "fchown"]) {
  installOperation(
    name,
    (path: any, value: any, gid: any) => {
      if (name.endsWith("chmod")) fileMode(value);
      else {
        validateInteger(value, "uid", -1, 0xffffffff);
        validateInteger(gid, "gid", -1, 0xffffffff);
      }
      if (name.startsWith("f")) {
        validateInteger(path, "fd", 0, 2147483647);
        temporary.fstatSync(path);
      } else if (name.startsWith("l") && temporaryPath(path))
        temporary.lstatSync(path);
      else api.statSync(path);
    },
    !name.startsWith("f"),
  );
}
installOperation("statfs", (path: any, options: any = {}) => {
  pathOf(path);
  validateObject(options, "options");
  const bigint = options.bigint ?? false;
  validateBoolean(bigint, "options.bigint");
  const value = bigint ? 0n : 0;
  return {
    type: value,
    bsize: value,
    blocks: value,
    bfree: value,
    bavail: value,
    files: value,
    ffree: value,
  };
});
const openPromise = promises.open;
promises.open = async (...args: any[]) => {
  fileMode(args[2], 0o666);
  args[2] = 0o666;
  const handle = await openPromise(...args);
  const stat = handle.stat.bind(handle);
  handle.stat = async (...options: any[]) =>
    temporaryStats(await stat(...options));
  handle.chmod = async (mode: unknown) => {
    fileMode(mode);
    await stat();
  };
  handle.chown = async (uid: number, gid: number) => {
    validateInteger(uid, "uid", -1, 0xffffffff);
    validateInteger(gid, "gid", -1, 0xffffffff);
    await stat();
  };
  return handle;
};
// Copy an embedded bundle file into request-local /tmp without granting any
// write access to its source volume.
const temporaryCopyFile = api.copyFileSync;
installOperation("copyFile", (source: any, destination: any, mode = 0) => {
  if (![0, 1, 2, 4].includes(mode))
    throw Object.assign(new TypeError("Invalid copy mode"), {
      code: "ERR_INVALID_ARG_VALUE",
    });
  if (mode === 4)
    throw Object.assign(new Error("The operation is not supported"), {
      code: "ERR_UNSUPPORTED_OPERATION",
    });
  if (temporaryPath(source))
    return temporaryCopyFile(source, destination, mode);
  writablePath(destination, "copyFile");
  if (mode === 1 && api.existsSync(destination))
    throw Object.assign(new Error("File already exists"), { code: "EEXIST" });
  temporary.writeFileSync(destination, embedded.readFileSync(pathOf(source)));
});
api.promises = promises;
export { promises };
export const {
  Dir,
  Dirent,
  F_OK,
  FileReadStream,
  FileWriteStream,
  R_OK,
  ReadStream,
  Stats,
  W_OK,
  WriteStream,
  X_OK,
  access,
  accessSync,
  appendFile,
  appendFileSync,
  chmod,
  chmodSync,
  chown,
  chownSync,
  close,
  closeSync,
  constants,
  copyFile,
  copyFileSync,
  cp,
  cpSync,
  createReadStream,
  createWriteStream,
  exists,
  existsSync,
  fchmod,
  fchmodSync,
  fchown,
  fchownSync,
  fdatasync,
  fdatasyncSync,
  fstat,
  fstatSync,
  fsync,
  fsyncSync,
  ftruncate,
  ftruncateSync,
  futimes,
  futimesSync,
  glob,
  globSync,
  lchmod,
  lchmodSync,
  lchown,
  lchownSync,
  link,
  linkSync,
  lstat,
  lstatSync,
  lutimes,
  lutimesSync,
  mkdir,
  mkdirSync,
  mkdtemp,
  mkdtempSync,
  open,
  openAsBlob,
  openSync,
  opendir,
  opendirSync,
  read,
  readFile,
  readFileSync,
  readSync,
  readdir,
  readdirSync,
  readlink,
  readlinkSync,
  readv,
  readvSync,
  realpath,
  realpathSync,
  rename,
  renameSync,
  rm,
  rmSync,
  rmdir,
  rmdirSync,
  stat,
  statSync,
  statfs,
  statfsSync,
  symlink,
  symlinkSync,
  truncate,
  truncateSync,
  unlink,
  unlinkSync,
  unwatchFile,
  utimes,
  utimesSync,
  watch,
  watchFile,
  write,
  writeFile,
  writeFileSync,
  writeSync,
  writev,
  writevSync,
} = api;
export default api;
