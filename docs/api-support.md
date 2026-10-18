# API and service support map

The source tree separates API origin from cloud resource execution policy.
Folder presence means an implementation exists, not that its full API is certified.

| Area                         | Source and status                                                                                | Responsibility                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Node.js compatibility        | [compat/node](../src/compat/node/README.md), [module inventory](node-compatibility-inventory.md) | Workers-compatible Node modules                                   |
| Web-standard APIs            | [compat/web](../src/compat/web/README.md)                                                        | Local Web API behavior and Workers adaptations                    |
| Workers-specific APIs        | [compat/workers](../src/compat/workers/README.md)                                                | Cloudflare-owned runtime modules and lifecycle APIs               |
| Cloudflare bindings/services | [bindings](../src/bindings/README.md)                                                            | Local KV, binding configuration and whole-request remote dispatch |
| Shared internals             | [compat/shared](../src/compat/shared/README.md)                                                  | Installation, codecs and HTTP wire helpers                        |

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
Root/demo typechecks and a clean build pass; root unit tests pass 409/409.
The workerd run passed 93 tests initially, and its remaining Node contract test
passed after restoring a path-test literal accidentally changed during relocation.
The packed consumer passes Vite/esbuild/browser ESM, development Fetch imports,
direct/isolated execution and all 326 shared feature cases. Cloudflare binding
and Service Binding integrations each pass all five groups. Native binaries are
unchanged; existing native evidence is historical and was not rerun for this move.
