# API and service support map

The source tree separates API origin from cloud resource execution policy.
Folder presence means an implementation exists, not that its full API is certified.

| Area                         | Source and status                                                                      | Responsibility                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Node.js compatibility        | [compat](../src/compat/README.md), [module inventory](node-compatibility-inventory.md) | Workers-compatible Node modules                                   |
| Browser APIs                 | [browser](../src/browser/README.md)                                                    | Local browser API behavior and Workers adaptations                |
| Workers-specific APIs        | [cloudflare/apis](../src/cloudflare/apis/README.md)                                    | Cloudflare-owned runtime modules and lifecycle APIs               |
| Cloudflare bindings/services | [cloudflare/bindings](../src/cloudflare/bindings/README.md)                            | Local KV, binding configuration and whole-request remote dispatch |
| Shared internals             | [shared](../src/shared/README.md)                                                      | Installation, codecs and HTTP wire helpers                        |

Use **local implementation**, **remote HTTP dispatch**, **partial/unverified**, or
**not implemented** explicitly. A service whose requests are forwarded is not a
locally implemented compatible API. Only the full [acceptance gate](../CONTRIBUTING.md#acceptance-gate)
can establish Complete status. Existing evidence keeps its original tested
revision and baseline; reorganizing source does not recertify it.

`src/contracts` owns the typed feature/lifecycle and contract runner infrastructure.
The concrete Fetch adapter and portable contract belong to `src/runtime/fetch`;
the KV contract belongs to `src/cloudflare/bindings/kv`. `src/runtime/fetch`, `src/runtime/isolated` and `src/runtime/documents` own application
execution, isolation and document hosting; they are not API support categories.
Public package subpaths and `node:*` / `cloudflare:*` aliases remain unchanged.

## Role-based layout

[Source roles](../src/README.md) describes build tooling, application execution,
API implementations and contract infrastructure. Build tools remain in `src/build`;
`src/runtime/{fetch,isolated,documents}` owns execution. Cloudflare APIs and bindings
are grouped under `src/cloudflare`. Public package subpaths are unchanged.

## Verification

This role-based reorganization preserves public export keys and validates every
compiled export target. Root/demo typechecks and a clean build pass.

- Unit tests: 410 across 41 files.
- Workerd contracts: 94; the standard suite was rerun after correcting demo entry paths.
- Runtime production: 66 Chromium/WebKit tests; runtime development: 20.
- Documents: 72 tests reported passed, retaining the existing expected-failure declarations.
- Build tools: 12 build tests plus 30 browser checks.
- Fresh packed consumer: 10 Vite/esbuild/raw ESM checks, 2 development Fetch checks,
  26 direct / 22 isolated checks, 326 shared feature cases and 2 preferences checks.
- Cloudflare binding and Service Binding integrations: five groups each, no skips.
- Documentation links and whitespace checks pass.

The preceding layout migration evidence retains its original revision. Native
binaries are unchanged; native suites were not rerun for this source reorganization.
No additional API is certified Complete by moving it.
