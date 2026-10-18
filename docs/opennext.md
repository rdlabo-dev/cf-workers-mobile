# OpenNext and vinext support

OpenNext and vinext use the Workers compatibility profile, but full framework
support and native WebView acceptance are not established. Filesystem, module
loading, async context and cloud binding restrictions apply. Use the
[Node inventory](compatibility.md) for module status.

## What the runtime provides

| Surface                              | Implementation                                                                                                                                                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cloudflare:workers` `env`           | The isolated transport sets a realm-wide proxy before `worker.fetch`; direct dispatch does not set it. It is not request-local and is unavailable during initial module evaluation. Use the handler argument where possible.                                                                                                             |
| `cloudflare:workers` `DurableObject` | Base class so OpenNext's exported DO subclasses (queue, tag cache, cache purge) resolve and construct. No DO storage; configure `open-next.config` with `incrementalCache: "dummy"`, `tagCache: "dummy"`, `queue: "dummy"` to drop them. |
| `node:async_hooks`                   | Scoped ALS approximation (see Async context below).                                                                                                                                                                                      |
| `node:fs` / `node:fs/promises`       | Read-only in-memory virtual filesystem. `readFile(Sync)`, `readdir(Sync)`, `existsSync`, `stat(Sync)`, `lstat(Sync)`, `realpathSync`, `promises.{readFile,readdir,stat,lstat,realpath,access}`. Writes throw.                            |
| `node:module`                        | `builtinModules`, `isBuiltin`, `createRequire` (VFS-backed `.json` only; executable modules throw).                                                                                                                                      |
| `node:stream/web`                    | Owned stream adapter with a packaged byte-stream fallback when the host lacks it; full Workers stream parity remains unverified.                                                                                                                                                                                                            |
| `node:util`                          | Module-owned util implementation and shared contracts, with remaining export/engine gaps listed in the inventory.                                                                                                                                                                                     |
| Other `node:*`                       | Module-owned implementations plus dependency fallbacks; the current alias table is `src/tooling/shared.ts`. Importability is not whole-module acceptance; see the Node inventory.                   |

## Embedding traced files (`workerFiles`)

OpenNext's `server-functions/default` keeps `.next` manifests and traced
`node_modules` that Next reads at runtime through `node:fs`. Pass the whole
directory to the bundler plugins; files are base64-embedded into the worker
bundle and registered into the VFS at startup.

```ts
// vite.config.ts / esbuild
workersCapacitorPlugin({
  worker: ".open-next/worker.js",
  workerFiles: [
    /* every file under .open-next/server-functions/default */
  ],
});
```

VFS lookups normalize separators and suffix-match, so absolute traced paths
resolve regardless of the bundle's build-time directory.

## Async context (the real boundary)

- The Capacitor Vite/esbuild plugins lower async functions and generators to
  Promise continuations while preserving top-level `await`. The compatibility
  implementation captures context at callback registration and restores it after
  each synchronous scope. Concurrent and nested async scopes use separate stores;
  dispatch serialization is no longer required for the shared ALS contract.
- Untransformed native async callbacks passed to `run`/`exit` reject before execution
  instead of silently leaking another request's store. Dynamic code and externally
  built modules must participate in the same transform.
- The transforms and aliases belong only in the Capacitor build. Cloudflare keeps
  its native `node:async_hooks`; the Worker application source is unchanged.
- Direct-mode patches affect the UI realm too. Prefer an isolated Worker for
  ALS-dependent applications. Full OpenNext native acceptance remains separate
  from the shared ALS contract.

## Current gaps

- **Native WebView verification** (iOS/Android) and startup-cost measurement
  remain follow-up before any "Complete" status claim.
- **Bindings:** use the [remote binding configuration](cloudflare-bindings.md) for cloud services or explicit local KV in direct mode. ASSETS remains remote-only. These general integrations do not establish OpenNext cache/binding compatibility; the smoke configuration uses dummy caches.
- `createRequire` loads `.json` only; executable traced files must already be
  bundled by OpenNext (they are).
- Image optimization (`/_next/image`, `cdn-cgi`) and middleware are outside
  the verified path.
- Startup time and memory with embedded VFS files remain unverified on real WebViews.
