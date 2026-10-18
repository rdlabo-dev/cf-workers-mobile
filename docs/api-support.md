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

`src/shared/contracts` owns the typed feature/lifecycle and contract runner infrastructure.
The concrete Fetch adapter and portable contract belong to `src/cloudflare/workers`;
the KV contract belongs to `src/cloudflare/bindings/kv`. `src/cloudflare/workers`, `src/browser/isolated` and `src/browser/documents` own application
execution, isolation and document hosting; they are not API support categories.
Public package subpaths follow these roles (see [source roles](../src/README.md)).
Old subpaths are removed before release. `node:*` / `cloudflare:*` aliases are unchanged.

## Role-based layout

[Source roles](../src/README.md) describes build tooling, application execution,
API implementations and contract infrastructure. Build tools remain in `src/tooling`;
`src/cloudflare/workers` coordinates execution; `src/browser/isolated` and
`src/browser/documents` own browser host mechanisms. Cloudflare APIs and bindings
are grouped under `src/cloudflare`. Consumer imports and examples use the role-based public entry points.

## Verification

At revision `5e28bd9`, the preceding role-based reorganization preserved public export keys and validates every
compiled export target. Root/demo typechecks and a clean build passed.

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

## Pre-release entry-point alignment

Browser document hosting and Dedicated Worker transport now live under
`src/browser`; Workers handler execution lives under `src/cloudflare/workers`.
Build-time integrations and transforms live under `src/tooling`.

Public paths follow these responsibilities. The old `features`, `testing`,
`worker`, `vite`, `esbuild` and `cloudflare` entry points have been removed without
compatibility aliases. See [the entry-point inventory](../src/README.md).
This is a pre-release layout change; API behavior is unchanged.

Validation for this pre-release alignment includes root/demo typechecks, a clean
build, 410 unit tests, 94 workerd tests, 66 production runtime checks, 20 Vite
development checks, 72 document checks (with existing expected failures), and
12 build-unit plus 30 browser integration checks. Cloudflare binding and Service
Binding integrations each pass five groups. Documentation links and all twelve
public export targets are checked; obsolete compiled locations are absent.
Native suites were not rerun for this path-only change.

The final packed consumer passes 10 Vite/esbuild/raw ESM checks, two configured
Fetch checks in Vite dev, 26 direct and 22 isolated checks, 326 shared feature
cases, and two execution-preference checks using the new public paths.

The generic contract/lifecycle infrastructure lives in `src/shared/contracts`,
with public `shared/contracts` and `shared/contracts/testing` entry points.
Its implementation is unchanged by relocation. Root/demo typechecks, clean build,
410 unit tests, 94 workerd tests and the complete packed-consumer verification
were repeated successfully after this final move.
