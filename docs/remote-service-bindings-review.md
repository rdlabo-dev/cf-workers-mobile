# Remote service bindings review record

Reviewed on 2026-10-18. Implementation candidate:
`310479fe46f3a82a867cf52f58634ca4c7692de5`, against main
`a803bf94d34258bb311a06506091681427a52b39`.

Two separate agent reviewers performed supervisor and third-party acceptance
reviews. These are local independent reviews, not human or GitHub approvals.
Neither reviewer edited the implementation. Both approved in round one with no
required changes; the subsequent commit changes documentation only.

## Supervisor — approved

Reviewed explicit KV policies and validation, request-level remote precedence,
server code exclusion, Queue consumer fallback, HTTP/RPC boundaries, Cookie
analysis, bounded upload buffering/cancellation and browser null-body handling.
Independently executed service binding and D1 compiler tests, remote transport
and Fetch interop: 4 files, 58 tests passed.

## Third-party acceptance — approved

Reviewed the named HTTP dispatch unit against CONTRIBUTING, configuration,
real workerd fixtures, source exclusion, native evidence and CI integration.
Independently executed service bindings/remote/interop (45 tests) and
D1/Hyperdrive compiler regressions (19 tests): 64 tests passed.
Real workerd integration passed all 5 groups, with zero skips: 16 combinations
of Vite/esbuild, selective/whole-Worker, Chromium/WebKit and direct/Dedicated
Worker, plus Vite development startup.

The reviewer checked the iOS/Android 34-check evidence and runner sources without
claiming to have independently rerun the native suite.

## Maintainer-agent verification

- Typecheck/build and full unit suite: 367 tests passed.
- D1 and service integration: 10 Node test groups passed.
- Fresh tarball with iOS 26.1 simulator and Android 16/API 36 emulator: 34 checks
  each passed, including explicit local/remote KV, R2/KV remote precedence,
  real HTTP/RPC services and queue delivery. Package integrity and case results
  are in `remote-service-bindings-native-evidence.json`.
- Full package suite rerun after freeing disk space: Vite/esbuild/browser ESM
  10/10, Fetch subpath Vite dev 2/2, direct 26/26, isolated 22/22, common features
  320 passed, preferences 2/2. Six pre-existing feature cases remain declared
  unsupported in that suite; no new skipped service-dispatch tests were added.

The unit is reuse of an existing deployed HTTP handler, not local emulation of
R2, service RPC or cloud queue APIs. Native tests use local HTTPS/workerd and a
test CA; they do not certify physical devices or deployed Cloudflare resources.
Queue completion tracking is application-owned. Required CI remains pending and
must pass before leaving draft/merging. These reviews do not certify unrelated
PoC compatibility units as complete.

## Follow-up: remove Swift CodeQL

At the user's explicit request, removed the Swift CodeQL matrix entry and its
macOS-only preparation/build steps. Actions, JavaScript/TypeScript and Java/Kotlin
analysis remain. Both independent reviewers approved this follow-up with no
required changes; `actionlint .github/workflows/codeql.yml` passed. The active
main ruleset requires the aggregate `CI` check, not a separate Swift check.
Local iOS native acceptance remains required. The service-binding implementation
reviewed above is unchanged.
