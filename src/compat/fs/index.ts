import { fileMode } from "./mode.js";
import { validateInteger } from "../crypto/validation.js";
import * as embedded from "./embedded.js";
import {
  temporary,
  temporaryPath,
  clearTemporaryFiles,
  writablePath,
  pathOf,
  readonlyFile,
  embeddedStat,
} from "./writable.js";
import { Buffer } from "node:buffer";
import {
  validateFunction,
  validateObject,
  validateBoolean,
  validateUint32,
} from "../net/validators.js";
import { ERR_INVALID_ARG_VALUE, ERR_INVALID_ARG_TYPE } from "../net/errors.js";
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
      if (name === "ReadStream" || name === "FileReadStream")
        return temporary.createReadStream(...args);
      args[0] = writablePath(args[0], name);
      return temporary.createWriteStream(...args);
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
  "rename",
  "copyFile",
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
          throw Object.assign(new Error("operation not permitted"), {
            code: "EPERM",
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
function temporaryStats(stat: any, readonly = false) {
  if (stat == null) return stat;
  const bigint = typeof stat.mode === "bigint";
  const mode = (Number(stat.mode) & ~0o777) | (readonly ? 0o444 : 0o666);
  stat.mode = bigint ? BigInt(mode) : mode;
  for (const name of [
    "dev",
    "ino",
    "uid",
    "gid",
    "rdev",
    "blksize",
    "blocks",
    "atimeMs",
  ])
    stat[name] = bigint ? 0n : 0;
  stat.nlink = bigint ? 1n : 1;
  stat.atime = new Date(0);
  stat.ctime = stat.mtime;
  stat.ctimeMs = stat.mtimeMs;
  if (bigint) {
    stat.atimeNs = 0n;
    stat.ctimeNs = stat.mtimeNs;
  }
  if (readonly)
    for (const name of ["mtime", "ctime", "birthtime"]) {
      stat[name] = new Date(0);
      stat[name + "Ms"] = bigint ? 0n : 0;
      if (bigint) stat[name + "Ns"] = 0n;
    }
  return stat;
}
// Workers has no executable files. Read-only bundle files also report ENOENT
// for W_OK rather than exposing host-style permission bits.
function accessArgs(path: unknown, mode: unknown = 0) {
  const normalized = pathOf(path);
  mode ??= 0;
  validateInteger(mode, "mode", 0, 7);
  return { path: normalized, mode: mode as number };
}
function checkAccess({ path, mode }: ReturnType<typeof accessArgs>) {
  if (mode & 1 || (mode & 2 && readonlyFile(path)) || !api.existsSync(path))
    throw Object.assign(
      new Error(`ENOENT: no such file or directory, access '${path}'`),
      {
        code: "ENOENT",
        errno: -2,
        syscall: "access",
        path,
      },
    );
}
api.accessSync = (path: unknown, mode?: unknown) =>
  checkAccess(accessArgs(path, mode));
api.access = (path: unknown, mode: unknown, callback?: any) => {
  if (typeof mode === "function") {
    callback = mode;
    mode = undefined;
  }
  const args = accessArgs(path, mode);
  validateFunction(callback, "callback");
  let failure: unknown = null;
  try {
    checkAccess(args);
  } catch (error) {
    failure = error;
  }
  queueMicrotask(() => callback(failure));
};
promises.access = async (path: unknown, mode?: unknown) =>
  checkAccess(accessArgs(path, mode));
for (const name of ["stat", "lstat"])
  installOperation(name, (path: any, options?: any) =>
    temporaryPath(path)
      ? temporaryStats(
          temporary[name + "Sync"](path, options),
          readonlyFile(path, name !== "lstat"),
        )
      : temporaryStats(embeddedStat(path, options), true),
  );
installOperation(
  "fstat",
  (...args: any[]) =>
    temporaryStats(temporary.fstatSync(...args), readonlyFile(args[0])),
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
// Workers interprets numeric timestamps as milliseconds and does not change
// metadata belonging to embedded files. Convert before the memfs boundary.
function fileTime(value: any): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number" || typeof value === "string")
    return new Date(value);
  if (typeof value === "bigint") return new Date(Number(value));
  throw new ERR_INVALID_ARG_TYPE(
    "time",
    ["string", "number", "bigint", "Date"],
    value,
  );
}
for (const name of ["utimes", "lutimes", "futimes"]) {
  installOperation(
    name,
    (path: any, atime: any, mtime: any) => {
      const access = fileTime(atime),
        modified = fileTime(mtime);
      if (name === "futimes") {
        validateInteger(path, "fd", 0, 2147483647);
        api.fstatSync(path);
      } else api[name === "lutimes" ? "lstatSync" : "statSync"](path);
      if (!readonlyFile(path, name !== "lutimes"))
        temporary[name + "Sync"](path, access, modified);
    },
    name !== "futimes",
  );
}
const openPromise = promises.open;
promises.open = async (...args: any[]) => {
  fileMode(args[2], 0o666);
  args[2] = 0o666;
  const handle = await openPromise(...args);
  const stat = handle.stat.bind(handle);
  const isReadonly = readonlyFile(handle.fd);
  const utimes = handle.utimes.bind(handle);
  handle.utimes = async (atime: any, mtime: any) => {
    const access = fileTime(atime),
      modified = fileTime(mtime);
    await stat();
    if (!isReadonly) await utimes(access, modified);
  };
  handle.stat = async (...options: any[]) =>
    temporaryStats(await stat(...options), isReadonly);
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
const copyTree = api.cpSync;
installOperation("cp", (source: any, destination: any, options: any = {}) => {
  validateObject(options, "options");
  const {
    dereference = false,
    errorOnExist = false,
    force = true,
    preserveTimestamps = false,
    recursive = false,
    verbatimSymlinks = false,
    mode = 0,
  } = options;
  for (const [key, value] of Object.entries({
    dereference,
    errorOnExist,
    force,
    preserveTimestamps,
    recursive,
    verbatimSymlinks,
  }))
    validateBoolean(value, "options." + key);
  validateUint32(mode, "options.mode");
  if (mode & 4)
    throw new ERR_INVALID_ARG_VALUE(
      "options.mode",
      "COPYFILE_FICLONE_FORCE is not supported",
    );
  if (options.filter !== undefined) {
    if (typeof options.filter !== "function")
      throw new ERR_INVALID_ARG_TYPE(
        "options.filter",
        "function",
        options.filter,
      );
    throw Object.assign(new Error("The requested operation is unsupported"), {
      code: "ERR_UNSUPPORTED_OPERATION",
    });
  }
  return copyTree(source, destination, {
    dereference,
    errorOnExist,
    force,
    recursive,
    verbatimSymlinks: false,
    preserveTimestamps: false,
    mode: 0,
  });
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
