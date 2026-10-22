// Copyright (c) 2017-2022 Cloudflare, Inc. Apache-2.0.
// Adapted from pinned workerd public_process.ts; these are Workers stubs, not host OS introspection.
import { NodeError } from "../net/error-base.js";
class ERR_METHOD_NOT_IMPLEMENTED extends NodeError {
  constructor(name: string) {
    super(
      "ERR_METHOD_NOT_IMPLEMENTED",
      `The ${name} method is not implemented`,
    );
  }
}
export class ERR_EPERM extends NodeError {
  path?: string;
  syscall: string;
  errno: number;
  constructor(options: { syscall: string; errno?: number; path?: string }) {
    const message = options.path
      ? `operation not permitted, ${options.syscall} '${options.path}'`
      : "operation not permitted";
    super("EPERM", message);
    this.syscall = options.syscall;
    if (options.path !== undefined) {
      this.path = options.path;
    }
    this.errno = options.errno ?? 1; // EPERM
  }
}

export const arch = "x64";

// For simplicity and polyfill expectations, we assign pid 1 to the process and pid 0 to the "parent".
export const pid = 1;
export const ppid = 0;

export const allowedNodeEnvironmentFlags = new Set();

export function setSourceMapsEnabled(
  _enabled: boolean,
  _options?: { nodeModules: boolean; generatedCode: boolean },
): void {
  // no-op since we do not support disabling source maps
}

export function getSourceMapsSupport(): {
  enabled: boolean;
  nodeModules: boolean;
  generatedCode: boolean;
} {
  return {
    enabled: false,
    nodeModules: false,
    generatedCode: false,
  };
}

export function ref(): void {
  // no-op
}

export function unref(): void {
  // no-op
}

export function setUncaughtExceptionCaptureCallback(
  _fn?: (...args: unknown[]) => void,
): void {
  throw new ERR_METHOD_NOT_IMPLEMENTED(
    "process.setUncaughtExceptionCaptureCallback",
  );
}

export function hasUncaughtExceptionCaptureCallback(): boolean {
  throw new ERR_METHOD_NOT_IMPLEMENTED(
    "process.hasUncaughtExceptionCaptureCallback",
  );
}

export function kill(_pid: number, _signal?: string | number): boolean {
  throw new ERR_METHOD_NOT_IMPLEMENTED("process.kill");
}

export function binding(_name: string): unknown {
  throw new ERR_METHOD_NOT_IMPLEMENTED("process.binding");
}

export function dlopen(
  _module: unknown,
  _filename: string,
  _flags?: number,
): void {
  throw new ERR_METHOD_NOT_IMPLEMENTED("process.dlopen");
}

export const exitCode: number | undefined = undefined;

export function getActiveResourcesInfo(): string[] {
  throw new ERR_METHOD_NOT_IMPLEMENTED("process.getActiveResourcesInfo");
}

export function memoryUsage(): {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
} {
  return {
    rss: 0,
    heapTotal: 0,
    heapUsed: 0,
    external: 0,
    arrayBuffers: 0,
  };
}

export function resourceUsage(): {
  userCPUTime: number;
  systemCPUTime: number;
  maxRSS: number;
  sharedMemorySize: number;
  unsharedDataSize: number;
  unsharedStackSize: number;
  minorPageFault: number;
  majorPageFault: number;
  swappedOut: number;
  fsRead: number;
  fsWrite: number;
  ipcSent: number;
  ipcReceived: number;
  signalsCount: number;
  voluntaryContextSwitches: number;
  involuntaryContextSwitches: number;
} {
  return {
    userCPUTime: 0,
    systemCPUTime: 0,
    maxRSS: 0,
    sharedMemorySize: 0,
    unsharedDataSize: 0,
    unsharedStackSize: 0,
    minorPageFault: 0,
    majorPageFault: 0,
    swappedOut: 0,
    fsRead: 0,
    fsWrite: 0,
    ipcSent: 0,
    ipcReceived: 0,
    signalsCount: 0,
    voluntaryContextSwitches: 0,
    involuntaryContextSwitches: 0,
  };
}

export function threadCpuUsage(): {
  user: number;
  system: number;
} {
  throw new ERR_METHOD_NOT_IMPLEMENTED("process.threadCpuUsage");
}

export function cpuUsage(_previousValue?: { user: number; system: number }): {
  user: number;
  system: number;
} {
  throw new ERR_METHOD_NOT_IMPLEMENTED("process.cpuUsage");
}

// Properties and constants
export const channel = null;
export const connected = false;
export const debugPort = 0; // may be implemented to align with inspector in future
export const noDeprecation = false;
export const traceDeprecation = false;
export const throwDeprecation = false;
export const sourceMapsEnabled = false;
export const execPath = "";

export const permission = {
  has: (): boolean => {
    throw new ERR_METHOD_NOT_IMPLEMENTED("process.permission.has");
  },
};

export const release = {
  name: "node",
  lts: true,
  sourceUrl: "",
  headersUrl: "",
};

export const report = {
  compact: false,
  directory: "",
  filename: "",
  getReport: (): Record<string, unknown> => {
    // We do not intend to implement process.report in workerd, but there
    // are some modules in the ecosystem that call it expecting it to exist and
    // not throw. Returning an empty object for now to satisfy that use case.
    return {};
  },
  reportOnFatalError: false,
  reportOnSignal: false,
  reportOnUncaughtException: false,
  excludeNetwork: false,
  excludeEnv: false,
  signal: "SIGUSR2",
  writeReport: (): string => {
    // In this case, there's an expectation that the function will produce
    // a report on disk and return the filename. Since we do not intend
    // to implement this API in workerd, we throw to indicate that.
    throw new ERR_METHOD_NOT_IMPLEMENTED("process.report.writeReport");
  },
};

export const finalization = {
  register: (): void => {
    throw new ERR_METHOD_NOT_IMPLEMENTED("process.finalization.register");
  },
  registerBeforeExit: (): void => {
    throw new ERR_METHOD_NOT_IMPLEMENTED(
      "process.finalization.registerBeforeExit",
    );
  },
  unregister: (): void => {
    throw new ERR_METHOD_NOT_IMPLEMENTED("process.finalization.unregister");
  },
};

// Additional undocumented APIs
export function _rawDebug(...args: unknown[]): void {
  console.log(...args);
}

export const moduleLoadList: string[] = [];
export const _preload_modules: string[] = [];

export function _linkedBinding(_name: string): unknown {
  throw new ERR_METHOD_NOT_IMPLEMENTED("process._linkedBinding");
}

export const domain = null;
export const _exiting = false;

export function _getActiveRequests(): unknown[] {
  return [];
}

export function _getActiveHandles(): unknown[] {
  return [];
}

export function _kill(_pid: number, _signal: number): boolean {
  throw new ERR_METHOD_NOT_IMPLEMENTED("process._kill");
}

export function constrainedMemory(): number {
  return 0;
}

export function availableMemory(): number {
  // This may be implemented in future, for now this matches unenv
  return 0;
}

export function execve(
  _file: string,
  _args: string[],
  _env: Record<string, string>,
): never {
  throw new ERR_METHOD_NOT_IMPLEMENTED("process.execve");
}

export function _fatalException(_err: Error): boolean {
  return false;
}

export function _tickCallback(): void {
  // no-op
}

export function _debugProcess(_pid: number): void {
  // no-op
}

export function _debugEnd(): void {
  // no-op
}

export function _startProfilerIdleNotifier(): void {
  // no-op
}

export function _stopProfilerIdleNotifier(): void {
  // no-op
}

export function send(_message: unknown, _sendHandle?: unknown): boolean {
  return false;
}

export function uptime(): number {
  return 0;
}

// On the virtual filesystem, we only support group 0
export function getegid(): number {
  return 0;
}

export function getgid(): number {
  return 0;
}

export function getgroups(): number[] {
  return [0];
}

// On the virtual filesystem, we only support user 0
export function geteuid(): number {
  return 0;
}

export function getuid(): number {
  return 0;
}

// We support group 0 but no others, with the virtual filesystem.
export function setegid(id: number | string): void {
  if (id !== 0) throw new ERR_EPERM({ syscall: "setegid" });
}

// We support group 0 but no others, with the virtual filesystem.
export function setgid(id: number | string): void {
  if (id !== 0) throw new ERR_EPERM({ syscall: "setgid" });
}

// We support group 0 but no others, with the virtual filesystem.
export function seteuid(id: number | string): void {
  if (id !== 0) throw new ERR_EPERM({ syscall: "seteuid" });
}

// We support group 0 but no others, with the virtual filesystem.
export function setuid(id: number | string): void {
  if (id !== 0) throw new ERR_EPERM({ syscall: "setuid" });
}

// We don't support setting or initializing arbitrary groups on the virtual filesystem.
export function setgroups(_groups: number[]): void {
  throw new ERR_EPERM({ syscall: "setgroups" });
}

export function initgroups(
  _user: number | string,
  _extractGroup: number | string,
): void {
  throw new ERR_EPERM({ syscall: "initgroups" });
}
