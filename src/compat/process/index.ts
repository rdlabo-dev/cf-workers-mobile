import * as metadata from "./metadata.js";
export {
  arch,
  pid,
  ppid,
  allowedNodeEnvironmentFlags,
  setSourceMapsEnabled,
  getSourceMapsSupport,
  ref,
  unref,
  setUncaughtExceptionCaptureCallback,
  hasUncaughtExceptionCaptureCallback,
  kill,
  binding,
  dlopen,
  exitCode,
  getActiveResourcesInfo,
  memoryUsage,
  resourceUsage,
  threadCpuUsage,
  cpuUsage,
  channel,
  connected,
  debugPort,
  noDeprecation,
  traceDeprecation,
  throwDeprecation,
  sourceMapsEnabled,
  execPath,
  permission,
  release,
  report,
  finalization,
  _rawDebug,
  moduleLoadList,
  _preload_modules,
  _linkedBinding,
  domain,
  _exiting,
  _getActiveRequests,
  _getActiveHandles,
  _kill,
  constrainedMemory,
  availableMemory,
  execve,
  _fatalException,
  _tickCallback,
  _debugProcess,
  _debugEnd,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  send,
  uptime,
  getegid,
  getgid,
  getgroups,
  geteuid,
  getuid,
  setegid,
  setgid,
  seteuid,
  setuid,
  setgroups,
  initgroups,
} from "./metadata.js";
// Event delivery, warning and nextTick integration for the WebView profile.
// Other process exports retain the existing polyfill; see ../events/README.md.
export * from "cf-workers-native:process-base";
import process from "./state.js";
export { default } from "./state.js";
import { EventEmitter } from "../events/index.js";
import { ERR_INVALID_ARG_TYPE, ERR_OUT_OF_RANGE } from "../net/errors.js";
let initialized = false;
function invoke(method: string, args: any[]): any {
  if (!initialized) {
    EventEmitter.init.call(process as any);
    initialized = true;
  }
  return Reflect.apply(EventEmitter.prototype[method], process, args);
}
export const on = (...args: any[]) => invoke("on", args);
export const addListener = on;
export const once = (...args: any[]) => invoke("once", args);
export const prependListener = (...args: any[]) =>
  invoke("prependListener", args);
export const prependOnceListener = (...args: any[]) =>
  invoke("prependOnceListener", args);
export const off = (...args: any[]) => invoke("off", args);
export const removeListener = off;
export const removeAllListeners = (...args: any[]) =>
  invoke("removeAllListeners", args);
export const emit = (...args: any[]) => invoke("emit", args);
export const listeners = (...args: any[]) => invoke("listeners", args);
const rawListeners = (...args: any[]) => invoke("rawListeners", args);
const eventNames = (...args: any[]) => invoke("eventNames", args);
const listenerCount = (...args: any[]) => invoke("listenerCount", args);
const getMaxListeners = (...args: any[]) => invoke("getMaxListeners", args);
const setMaxListeners = (...args: any[]) => invoke("setMaxListeners", args);
// Pinned workerd also implements nextTick with queueMicrotask.
export function nextTick(callback: (...args: any[]) => void, ...args: any[]) {
  queueMicrotask(() => callback(...args));
}
// Adapted from cloudflare/workerd@5358e3d337336eaf696a48bc1563d808b10feba5,
// src/node/internal/internal_process.ts, Apache-2.0.
// Copyright (c) 2017-2022 Cloudflare, Inc.
// https://opensource.org/licenses/Apache-2.0
export function emitWarning(
  warning: string | Error,
  options?: any,
  codeOrCtor?: any,
  maybeCtor?: any,
) {
  let err: Error & { code?: string; detail?: string };
  let name = "Warning",
    detail,
    code,
    ctor;
  if (typeof options === "object" && !Array.isArray(options)) {
    if (options.type) name = options.type;
    if (options.code) code = options.code;
    if (options.detail) detail = options.detail;
    ctor = options.ctor;
  } else if (typeof options === "string") {
    name = options;
    if (typeof codeOrCtor === "string") {
      code = codeOrCtor;
      if (typeof maybeCtor === "function") ctor = maybeCtor;
      else if (maybeCtor !== undefined)
        throw new ERR_INVALID_ARG_TYPE("ctor", "function", maybeCtor);
    } else if (typeof codeOrCtor === "function") ctor = codeOrCtor;
    else if (codeOrCtor !== undefined)
      throw new ERR_INVALID_ARG_TYPE("ctor", "function", codeOrCtor);
  } else if (typeof options === "function") ctor = options;
  else if (options !== undefined)
    throw new ERR_INVALID_ARG_TYPE("options", "object", options);
  if (typeof warning === "string") {
    err = new (ctor || Error)(warning);
    err.name = name;
  } else if (warning instanceof Error) {
    err = warning;
    if (name && name !== "Warning") err.name = name;
  } else throw new ERR_INVALID_ARG_TYPE("warning", "string or Error", warning);
  if (code) err.code = code;
  if (detail && typeof detail === "string") err.detail = detail;
  // WebKit lacks V8's captureStackTrace. Exact stack inspection remains a
  // process/engine acceptance gap even when warning delivery matches.
  Error.captureStackTrace?.(err, ctor || emitWarning);
  queueMicrotask(() => process.emit("warning", err));
}
export const hrtime = Object.assign(
  function hrtime(time?: [number, number]): [number, number] {
    if (time !== undefined) {
      if (!Array.isArray(time))
        throw new ERR_INVALID_ARG_TYPE("time", "tuple of integers", time);
      else if ((time as number[]).length !== 2)
        throw new ERR_OUT_OF_RANGE("time", "2", time);
    }
    const nanoTime = BigInt(Date.now()) * 1_000_000n;
    const nanosBigint = nanoTime % 1_000_000_000n;
    let seconds = Number((nanoTime - nanosBigint) / 1_000_000_000n);
    let nanos = Number(nanosBigint);
    if (time) {
      const [prevSeconds, prevNanos] = time;
      seconds -= prevSeconds;
      nanos -= prevNanos;
      // We don't have nanosecond-level precision, but if we
      // did (say with the introduction of randomness), this
      // is how we would handle nanosecond underflow
      if (nanos < 0) {
        seconds -= 1;
        nanos += 1e9;
      }
    }
    return [seconds, nanos];
  },
  {
    bigint: function (): bigint {
      return BigInt(Date.now()) * 1_000_000n;
    },
  },
);

Object.assign(process, {
  hrtime,
  ...metadata,
  on,
  addListener,
  once,
  prependListener,
  prependOnceListener,
  off,
  removeListener,
  removeAllListeners,
  emit,
  listeners,
  rawListeners,
  eventNames,
  listenerCount,
  getMaxListeners,
  setMaxListeners,
  nextTick,
  emitWarning,
});
