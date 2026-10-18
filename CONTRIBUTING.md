# Contributing

## Complete compatibility units only

We merge and release completed compatibility units. A useful subset, a working
framework demo, or passing tests for selected methods is not enough to accept a
new compatibility implementation.

For Node.js compatibility, the acceptance unit is a module, including its Workers
exports, subpaths and observable behavior. For a binding or Web API, define the
named API unit before implementation. Do not redefine the unit around the methods
that happen to work. Large units may be developed in several commits or draft PRs,
but incomplete implementation PRs must not be merged into main.

The target is Cloudflare Workers, not every API available in a Node.js process.
Pin the workerd version, compatibility date and flags. An operation unsupported
by that Workers baseline must reproduce its actual rejection, no-op or stub
behavior; it must not be omitted from testing.

## Supported execution environments

The current execution targets are Capacitor iOS and Android WebViews, in both
direct and Dedicated Worker execution. Ordinary browsers, Electron and Tauri are
future targets. This does not reduce the Workers API surface of a completed unit.

Chromium/WebKit tests verify JavaScript behavior, public imports, build integration,
global initialization and bridge protocols. Contracts requiring native network
privileges run against workerd and real iOS/Android transports with the same
expectations, in both execution modes. Browser mocks are not evidence of native
transport compatibility. Every operation must have an explicit verification target;
CORS, headers, cookies, redirects, streaming and cancellation must not be excluded.

## Acceptance gate

A compatibility implementation is ready to merge only when all of these are true:

- The baseline's exports, subpaths, signatures and relevant prototype methods
  have been inventoried, with no unresolved coverage decisions.
- Every required operation is implemented. There are no project-specific
  unsupported cases, skipped tests, TODO implementations, placeholder successes
  or empty exports standing in for required behavior.
- The same behavioral contracts pass against workerd and the local implementation.
  Contracts cover normal behavior, invalid input, errors, state, concurrency,
  cancellation and cleanup wherever applicable. Workers' own unsupported behavior
  is tested as an expected result, not skipped.
- Public imports and globals work before application evaluation in both Vite and
  esbuild, in-page and in a Dedicated Worker. Vite development startup, production
  builds and an independently installed npm tarball are verified.
- The relevant contracts pass on iOS and Android WebViews. Logs or screenshots
  identify the tested revision, platform and results. Passing an early subset of
  a native run is not a completed run.
- Required CI passes. Manager and independent acceptance reviews have no
  outstanding required changes. Reviewers check coverage completeness as well as
  test results; CI cannot prove a missing contract exists.
- Documentation records the completed unit, pinned baseline and verification
  evidence without a partial-support qualifier.

Only then may the inventory say **Complete**. Until then, use **In progress**,
**Unverified**, or **Not implemented**, and identify the remaining work.

## Work in progress

Keep incomplete compatibility work on a development branch or draft PR. Do not
activate it in a merged build alias, public export or default runtime path, and do
not ship it behind an experimental flag as a substitute for finishing it. Design
notes and reproducible experiments can be reviewed independently without adding
unfinished production behavior.

Existing PoC implementations are completion debt, not exceptions to this policy.
Their existing behavior is not automatically certified by this rule. Complete
and verify each unit before a release includes it; do not claim the whole package
is release-ready merely because one unit passes.

## Layout and tests

Keep each implementation in `src/compat/<module>/index.ts` and its contract/tests
in the adjacent `index.spec.ts`. Subpaths and dependency declarations belong to
that module directory. `demo/tests/` owns environment runners, not copies of
module behavior. Production compilation excludes specs. Consumer tests may copy
test contracts, but must resolve implementations from the packed package.

See the [compatibility inventory](docs/node-compatibility-inventory.md) for current
work and the [CI guide](docs/ci.md) for required checks.

Global APIs follow the same module ownership rule: Fetch, Headers, Request,
Response, AbortSignal, encoding and structuredClone keep their own behavior
contracts. `globals` tests cover installation, ownership, conflicts, rollback
and restoration, not a combined API behavior suite. API-specific installation
regressions live beside that API (for example, `abort/installation.spec.ts`).
Environment runners may share setup, but expose each API as a separate named
test; a single passing “globals” result must not stand in for individual APIs.
