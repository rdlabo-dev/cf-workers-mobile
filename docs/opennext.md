# OpenNext and vinext support

OpenNext and vinext use the Workers compatibility profile. Support depends on
where the request executes; remote rendering does not establish local framework
compatibility. The [standalone OpenNext sample](../demo/opennext/README.md) separates
these paths and keeps its test drivers outside the application.

## Execution and configuration

- With D1 and asset-first routing, the generated OpenNext Worker executes
  remotely as a whole. Configure `worker: ".open-next/worker.js"`,
  `assetsExecution: "remote"` and the deployed HTTPS `remote.origin`.
  No server application or virtual filesystem files are shipped to the device;
  `workerFiles` is unnecessary for this configuration.
- Local execution uses the generated Worker in a Dedicated Worker. The sample's
  test-only profile covers public SSR pages, client hydration, static images/CSS,
  Next.js links and middleware. It does not provide D1 or local ASSETS.
- The Vite plugin transforms builtin `require()` calls inside generated ESM
  `.mjs` files. This is a Capacitor build setting; the Cloudflare build stays
  independent.

See the [Node inventory](compatibility.md) for remaining runtime restrictions.

## What the runtime provides

| Surface                              | Implementation                                                                                                                                                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cloudflare:workers` `env`           | The isolated transport sets a realm-wide proxy before `worker.fetch`; direct dispatch does not set it. It is not request-local and is unavailable during initial module evaluation. Use the handler argument where possible.             |
| `cloudflare:workers` `DurableObject` | Base class so OpenNext's exported DO subclasses (queue, tag cache, cache purge) resolve and construct. No DO storage; configure `open-next.config` with `incrementalCache: "dummy"`, `tagCache: "dummy"`, `queue: "dummy"` to drop them. |
| `node:async_hooks`                   | Scoped ALS approximation (see Async context below).                                                                                                                                                                                      |
| `node:fs` / `node:fs/promises`       | Read-only in-memory virtual filesystem. `readFile(Sync)`, `readdir(Sync)`, `existsSync`, `stat(Sync)`, `lstat(Sync)`, `realpathSync`, `promises.{readFile,readdir,stat,lstat,realpath,access}`. Writes throw.                            |
| `node:module`                        | `builtinModules`, `isBuiltin`, `createRequire` (VFS-backed `.json` only; executable modules throw).                                                                                                                                      |
| `node:stream/web`                    | Owned stream adapter with a packaged byte-stream fallback when the host lacks it; full Workers stream parity remains unverified.                                                                                                         |
| `node:util`                          | Module-owned util implementation and shared contracts, with remaining export/engine gaps listed in the inventory.                                                                                                                        |
| Other `node:*`                       | Module-owned implementations plus dependency fallbacks; the current alias table is `src/tooling/shared.ts`. Importability is not whole-module acceptance; see the Node inventory.                                                        |

## Embedding traced files (`workerFiles`)

For a local generated OpenNext `worker.js` entry, both bundler plugins collect
`.next` JSON manifests and traced `package.json` files automatically. Generated
JavaScript, source maps, NFT traces and build-analysis output are not embedded
as filesystem data. Remote Worker replacements do not collect server files.

Additional application data read through `node:fs` must be listed in
`workerFiles` as individual paths (not directories):

```ts
workersCapacitorPlugin({
  worker: ".open-next/worker.js",
  // Only needed when the application reads additional data files:
  workerFiles: ["./templates/email.txt"],
});
```

The native local test wraps the generated entry to attach a test driver, so its
[configuration](../demo/tests/opennext/local/vite.config.ts) supplies the same
metadata explicitly. Automatic discovery applies to generated OpenNext entries,
not arbitrary wrapper modules or arbitrary third-party runtime data.

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

## Upstream application acceptance

The [official App Router acceptance fixture](../demo/tests/upstream/opennext/README.md) pins an upstream OpenNext application and preserves its application source and configuration. It covers hydrated Server Actions, form actions with redirects/query parameters, and delayed SSR with a Suspense loading fallback. Native tests exercise remote Worker execution and WebView hydration through the public API; they do not establish local Server Action support. The browser baseline runs separately in CI. See the fixture for reproduction commands and proxy/streaming test boundaries.

## Current gaps

- The sample's native scenarios cover public pages and remote D1/session flows,
  not arbitrary Next.js applications or release-build performance.
- **Bindings:** use the [remote binding configuration](cloudflare-bindings.md) for cloud services or explicit local KV in direct mode. ASSETS remains remote-only. These general integrations do not establish OpenNext cache/binding compatibility; the smoke configuration uses dummy caches.
- `createRequire` loads `.json` only; executable traced files must already be
  bundled by OpenNext (they are).
- `/_next/image` uses the remote Worker's IMAGES binding. The `/images` fixture checks actual PNG-to-WebP transformation and output dimensions through native rendering. The public-HTTPS scenario also verifies the deployed Cloudflare IMAGES binding on an iPhone 15 Pro Max running iOS 27.0.1 without installing a test CA. Custom `cdn-cgi` loaders remain unverified.
- The document host preserves observed Origin/Fetch Metadata. iOS recovers a missing form Origin only for a verified local main-frame initiator; opaque or unknown initiators remain untrusted. Keep CSRF validation. The sample uses a random token and a Secure, HttpOnly `__Host-` cookie.
- The OpenNext native harness records bundle size, launch-to-hydration time (including transport and launch tooling), and, where available, host-process RSS after hydration in `demo/artifacts/opennext-native/*-performance.json`. These are single-sample Debug measurements; the artifact identifies the execution environment. Physical iOS RSS is not collected and is reported as `null`. RSS excludes separate WebView renderer/GPU processes; it is not total or peak application memory. Pixel 8a Android 17 samples cover local and remote execution; the iPhone 15 Pro Max sample uses a deployed Worker and D1 over public HTTPS. Release-build startup distributions and peak memory remain unverified.
