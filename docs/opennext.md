# OpenNext and vinext support

Status: **scoped support, verified locally.** A Next.js 15.5 app built with
`@opennextjs/cloudflare`, re-bundled through this library's compatibility
profile, renders static and dynamic SSR routes (200 + real content) when the
worker entry is loaded through the documented pipeline. This is not a claim of
full Workers parity; the boundaries below are explicit.

vinext (Vite-driven Next.js builds) targets the same Workers runtime surface —
`nodejs_compat`, `cloudflare:workers`, AsyncLocalStorage, Web streams — and is
supported through the same compatibility profile. A dedicated vinext
verification fixture is a follow-up item.

## What the runtime provides

| Surface | Implementation |
| ------- | -------------- |
| `cloudflare:workers` `env` | Populated per request from the `env` argument passed to `worker.fetch(request, env, ctx)` by the transport (`setWorkerEnv`). |
| `cloudflare:workers` `DurableObject` | Base class so OpenNext's exported DO subclasses (queue, tag cache, cache purge) resolve and construct. No DO storage; configure `open-next.config` with `incrementalCache: "dummy"`, `tagCache: "dummy"`, `queue: "dummy"` to drop them. |
| `node:async_hooks` | Scoped ALS approximation (see Async context below). |
| `node:fs` / `node:fs/promises` | Read-only in-memory virtual filesystem. `readFile(Sync)`, `readdir(Sync)`, `existsSync`, `stat(Sync)`, `lstat(Sync)`, `realpathSync`, `promises.{readFile,readdir,stat,lstat,realpath,access}`. Writes throw. |
| `node:module` | `builtinModules`, `isBuiltin`, `createRequire` (VFS-backed `.json` only; executable modules throw). |
| `node:stream/web` | Platform stream constructors. |
| `node:util` | util polyfill + `TextEncoder`/`TextDecoder` globals. |
| Other `node:*` | Existing profile: path, querystring, string_decoder, buffer, http, net, stream, async_hooks, plus `node-stdlib-browser` polyfills (process, crypto, zlib, events, timers, url, assert, https, os, vm, tty, constants). |

## Embedding traced files (`workerFiles`)

OpenNext's `server-functions/default` keeps `.next` manifests and traced
`node_modules` that Next reads at runtime through `node:fs`. Pass the whole
directory to the bundler plugins; files are base64-embedded into the worker
bundle and registered into the VFS at startup.

```ts
// vite.config.ts / esbuild
capacitorWorkersPlugin({
  worker: ".open-next/worker.js",
  workerFiles: [/* every file under .open-next/server-functions/default */],
});
```

VFS lookups normalize separators and suffix-match, so absolute traced paths
resolve regardless of the bundle's build-time directory.

## Async context (the real boundary)

- `await` bypasses `Promise.prototype.then` in V8/JSC, so this runtime uses a
  **sticky context**: async `run`/`exit` keep their store installed until
  another scope overwrites it. That is what lets React's lazily scheduled
  render work (microtasks, `MessageChannel` tasks, stream pulls) see Next's
  `workUnitAsyncStorage`/`workAsyncStorage` stores.
- **Limitation:** concurrent interleaved request contexts are not isolated.
  Serialize dispatch for correctness. `settleRestore` semantics also diverge
  (`getStore` returns the stale store after an awaited run). Both are declared
  unsupported cases in the module contract, verified against pinned workerd.

## Current gaps

- **Bindings:** `env.ASSETS`, KV/R2/Queue are pass-through only; supply them
  via the `env` argument or stay on `dummy` cache config.
- **Concurrent requests** need dispatch serialization (ALS boundary above).
- `createRequire` loads `.json` only; executable traced files must already be
  bundled by OpenNext (they are).
- Image optimization (`/_next/image`, `cdn-cgi`) and middleware are outside
  the verified path.
- Bundle size: a minimal app's re-bundle is ~39 MB with embedded VFS; startup
  cost on real WebViews is unverified.
