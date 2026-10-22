// Copyright (c) 2017-2022 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

// Pinned Workers module metadata and explicit stubs.
class ERR_METHOD_NOT_IMPLEMENTED extends Error {
  readonly code = "ERR_METHOD_NOT_IMPLEMENTED";
  constructor(method: string) {
    super(`The ${method} method is not implemented`);
  }
}
export function register(): void {
  // TODO(soon): We might support this in the future.
  throw new ERR_METHOD_NOT_IMPLEMENTED("module.register");
}

export function runMain(): void {
  // We don't plan to support this in the future.
  throw new ERR_METHOD_NOT_IMPLEMENTED("module.runMain");
}

export function syncBuiltinESMExports(): void {
  // We are unlikely to ever support this.
  throw new ERR_METHOD_NOT_IMPLEMENTED("module.syncBuiltinESMExports");
}

export function wrap(): void {
  // TODO(soon): Implement this feature.
  throw new ERR_METHOD_NOT_IMPLEMENTED("module.wrap");
}

export const globalPaths: string[] = [];

const compileCacheStatus = Object.freeze({
  __proto__: null,
  FAILED: 0,
  ENABLED: 1,
  ALREADY_ENABLED: 2,
  DISABLED: 3,
});

export const constants = Object.freeze({
  __proto__: null,
  compileCacheStatus,
});

export const _cache = { __proto__: null };
export const _pathCache = { __proto__: null };

export function _debug(): void {
  // This is deprecated and will be removed in the future.
  throw new ERR_METHOD_NOT_IMPLEMENTED("module._debug");
}

export function _findPath(): void {
  // It doesn't make sense to support this.
  throw new ERR_METHOD_NOT_IMPLEMENTED("module._findPath");
}

export function _initPaths(): void {
  // It doesn't make sense to support this.
  throw new ERR_METHOD_NOT_IMPLEMENTED("module._initPaths");
}

export function _load(): void {
  // TODO(soon): Investigate the possibility of supporting this in the future.
  throw new ERR_METHOD_NOT_IMPLEMENTED("module._load");
}

export function _preloadModules(): void {
  // It doesn't make sense to support this.
  throw new ERR_METHOD_NOT_IMPLEMENTED("module._preloadModules");
}

export function _resolveFilename(): void {
  // TODO(soon): Investigate the possibility of supporting this in the future.
  throw new ERR_METHOD_NOT_IMPLEMENTED("module._resolveFilename");
}

export function _resolveLookupPaths(): void {
  // TODO(soon): Investigate the possibility of supporting this in the future.
  throw new ERR_METHOD_NOT_IMPLEMENTED("module._resolveLookupPaths");
}

export function _nodeModulePaths(): void {
  // It doesn't make sense to support this.
  throw new ERR_METHOD_NOT_IMPLEMENTED("module._nodeModulePaths");
}

export function findSourceMap(): void {
  // TODO(soon): Investigate the possibility of supporting this in the future.
  throw new ERR_METHOD_NOT_IMPLEMENTED("module.findSourceMap");
}

export function findPackageJSON(): void {
  // It doesn't make sense to support this.
  throw new ERR_METHOD_NOT_IMPLEMENTED("module.findPackageJSON");
}

export function flushCompileCache(): void {
  // We don't implement compile cache. This acts as a no-op.
}

export function getSourceMapsSupport(): Record<string, boolean | null> {
  return Object.freeze({
    __proto__: null,
    enabled: false,
    nodeModules: false,
    generatedCode: false,
  });
}

export function setSourceMapsSupport(): void {
  // We don't implement source maps support.
  throw new ERR_METHOD_NOT_IMPLEMENTED("module.setSourceMapsSupport");
}

export function stripTypeScriptTypes(): void {
  // We don't implement stripping TypeScript types.
  throw new ERR_METHOD_NOT_IMPLEMENTED("module.stripTypeScriptTypes");
}

export function registerHooks(): void {
  // We don't implement hooks registration.
  throw new ERR_METHOD_NOT_IMPLEMENTED("module.registerHooks");
}

export function SourceMap(): void {
  // We don't support source maps.
  throw new ERR_METHOD_NOT_IMPLEMENTED("module.SourceMap");
}

export function enableCompileCache(): void {
  // We don't plan to support this in the future.
  // Since, this method shouldn't throw an error, we just act like a no-op.
}

export function getCompileCacheDir(): undefined {
  // We don't plan to support this in the future.
  // Since, compile cache acts as a no-op, we just return undefined.
  return undefined;
}

export const _extensions = {
  ".js": (): never => {
    throw new ERR_METHOD_NOT_IMPLEMENTED("module._extensions.js");
  },
  ".json": (): never => {
    throw new ERR_METHOD_NOT_IMPLEMENTED("module._extensions.json");
  },
  ".node": (): never => {
    throw new ERR_METHOD_NOT_IMPLEMENTED("module._extensions.node");
  },
};
