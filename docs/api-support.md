# API and service support map

The source tree separates API origin from cloud resource execution policy.
Folder presence means an implementation exists, not that its full API is certified.

| Area                         | Source and status                                                                      | Responsibility                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Node.js compatibility        | [compat](../src/compat/README.md), [module inventory](node-compatibility-inventory.md) | Workers-compatible Node modules                                   |
| Browser APIs                 | [browser](../src/browser/README.md)                                                    | Local browser API behavior and Workers adaptations                |
| Workers-specific APIs        | [workers](../src/workers/README.md)                                                    | Cloudflare-owned runtime modules and lifecycle APIs               |
| Cloudflare bindings/services | [bindings](../src/bindings/README.md)                                                  | Local KV, binding configuration and whole-request remote dispatch |
| Shared internals             | [shared](../src/shared/README.md)                                                      | Installation, codecs and HTTP wire helpers                        |

Use **local implementation**, **remote HTTP dispatch**, **partial/unverified**, or
**not implemented** explicitly. A service whose requests are forwarded is not a
locally implemented compatible API. Only the full [acceptance gate](../CONTRIBUTING.md#acceptance-gate)
can establish Complete status. Existing evidence keeps its original tested
revision and baseline; reorganizing source does not recertify it.

`src/features` remains the common typed feature/contract infrastructure, with a
Fetch runtime adapter. `src/fetch`, `src/isolated` and `src/documents` own application
execution, isolation and document hosting; they are not API support categories.
Public package subpaths and `node:*` / `cloudflare:*` aliases remain unchanged.

## Layout migration verification

The layout-only change preserves public package subpaths and runtime behavior.
The final top-level compat/browser/workers/bindings layout passes root/demo
typechecks, a clean build, 410 unit tests and 94 workerd tests. The packed consumer
passes Vite/esbuild/browser ESM (10 checks), development Fetch imports (2), direct
execution (26), isolated execution (22), shared feature cases (326), and preferences
(2). Cloudflare binding and Service Binding integrations each pass all five groups.
Existing native evidence retains its original revision; native binaries are
unchanged and are not recertified by this source move.

Vite development rewrites the shared global installer's Blob/File import to the
optimized `node:buffer` module. The rewrite follows the new folder location; a
regression test reads the actual installer source. All 20 Chromium/WebKit runtime
development tests pass, including global constructor identity.
