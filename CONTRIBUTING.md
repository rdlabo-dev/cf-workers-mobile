# Contributing

## Formatting

Run `npm run format` from the repository root before submitting changes. `npm run format:check` checks the same files without modifying them and is required by the library CI job. Use the exact Prettier version in the root package; the demo uses the same configuration. Markdown prose keeps intentional line breaks (`proseWrap: "preserve"`). Generated files, native project scaffolding and upstream license text are excluded in `.prettierignore`.

## Complete compatibility units only

New compatibility implementations must be completed before merge or release. A useful subset, a working framework demo, or passing tests for selected methods is not enough. The release exceptions cover existing implementations in [0.1.0 Preview and its explicitly authorized 0.1.1 follow-up](#010-preview-exception).

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
- Documentation describes current API behavior, the pinned baseline, limitations
  and reproduction commands. Keep completion reports, review history and test-run
  evidence in PRs and generated artifacts, not accumulating in README or docs.

Only then may the inventory say **Complete**. Until then, use **In progress**,
**Unverified**, or **Not implemented**, and identify the remaining work.

## Work in progress

Keep incomplete compatibility work on a development branch or draft PR. Do not
activate it in a merged build alias, public export or default runtime path, and do
not ship it behind an experimental flag as a substitute for finishing it. Design
notes and reproducible experiments can be reviewed independently without adding
unfinished production behavior.

### 0.1.0 Preview exception

0.1.0 Preview may include existing compatibility implementations with the limitations documented in the [compatibility inventory](docs/compatibility.md). Their inclusion does not establish complete module compatibility or certify untested behavior. Keep missing exports, unsupported operations and verification boundaries visible; a passing application scenario does not make its dependencies complete.

This exception applies only to existing implementations in 0.1.0 Preview. It does not permit new incomplete compatibility units, bypass required CI or application acceptance, or automatically extend to subsequent releases. New compatibility implementations must satisfy the acceptance gate above. Except for the explicitly authorized 0.1.1 follow-up below, existing incomplete units remain completion debt and must be completed and verified, or excluded, before a subsequent release includes them.

### 0.1.1 Preview follow-up

0.1.1 is explicitly authorized to retain the existing compatibility limitations documented in the inventory, provided its changes pass regression checks and required CI. This is a version-specific continuation of the Preview scope, not a claim that incomplete modules are complete. Keep known failures and unverified behavior visible in release notes. It does not authorize new incomplete compatibility units or extend the exception to later versions.

## Layout and tests

Keep runtime implementations in `src/compat/<module>/index.ts`, `src/browser/<module>/index.ts`, or
`src/cloudflare/apis/<module>/index.ts`
according to API ownership, with contracts/tests in the adjacent `index.spec.ts`.
Cloud resource adapters and execution policy belong in `src/cloudflare/bindings`; cross-domain
installation/codecs belong in `src/shared`. Application execution belongs in
`src/cloudflare/workers` and browser host mechanisms in `src/browser`, build tooling in `src/tooling`, and the reusable feature/contract host
in `src/shared/contracts`. See the [source layout](src/README.md). Subpaths and dependency declarations belong to
that module directory. `demo/tests/` owns environment runners, not copies of
module behavior. Production compilation excludes specs. Consumer tests may copy
test contracts, but must resolve implementations from the packed package.

See [compatibility limits](docs/compatibility.md) and the [contract API](docs/contracts.md).

Global APIs follow the same module ownership rule: Fetch, Headers, Request,
Response, AbortSignal, encoding and structuredClone keep their own behavior
contracts. `globals` tests cover installation, ownership, conflicts, rollback
and restoration, not a combined API behavior suite. API-specific installation
regressions live beside that API (for example, `abort/installation.spec.ts`).
Environment runners may share setup, but expose each API as a separate named
test; a single passing “globals” result must not stand in for individual APIs.

## CI and regression protection

The required `CI` check aggregates library, the compatibility matrix, bindings,
streams-fallback, package and upstream jobs. Workers/browser, runtime/documents
and build-tool checks run on separate runners; only the bindings job starts MySQL. Every job must succeed; skipped or cancelled jobs
cannot satisfy the gate. Main requires a pull request, an up-to-date branch and
this check, and blocks force pushes and deletion. Workflow configuration is in
[ci.yml](.github/workflows/ci.yml); CodeQL is configured separately.

Library checks include types, adjacent contracts and reproducible URL generation.
Integration checks use pinned local workerd, Chromium/WebKit, both build tools,
forced stream fallbacks and a fresh installed tarball. The upstream job clones
the pinned official Hono sample. Selected third-party fixtures also build and run
through the public API on independent Android emulator jobs. iOS, live cloud-service
checks and physical-device validation remain separate from required CI; see the
[native test procedure](demo/tests/README.md).
The document suite's explicit WebKit comparison differences are documented in
[compatibility limits](docs/compatibility.md); they are not successful behaviors.

Require every case in a claimed-supported profile to pass, including cleanup.
`assertContract` alone permits partial coverage and is insufficient for acceptance.
The independent feature/case list in `demo/tests/validation/expected-cases.json`
guards against silent case removal; changes require review. Shared builtin
registration lives in `src/tooling/shared.ts`, not separate Vite/esbuild lists.
Keep exploratory probes outside required acceptance; use `test:node-boundaries`
in the demo when investigating engine differences. Never promote a probe result
or a namespace match to full behavioral support.

## npm releases

| Trigger                                                                   | npm dist-tag | Version                                    |
| ------------------------------------------------------------------------- | ------------ | ------------------------------------------ |
| Maintainer comments `/beta` on a CI-passing PR                            | `beta`       | `<base>-beta.pr<PR>.sha<12-character SHA>` |
| PR merged into `main`, after Compatibility succeeds for that merge commit | `beta`       | `<base>-beta.pr<PR>.sha<12-character SHA>` |
| Stable tag such as `v0.1.1`                                               | `latest`     | `0.1.1`                                    |
| Prerelease/revision tag such as `v0.2.0-rc.1`                             | `next`       | `0.2.0-rc.1`                               |

Direct pushes and PR branches do not automatically publish beta packages. A newer main commit supersedes an older beta candidate. Beta and next releases do not change `latest`.

For a tagged release, update `package.json` to the intended version in a PR, merge it and wait for Compatibility to pass on main. Then tag that commit and push the tag, for example `git tag v0.1.1` followed by `git push origin v0.1.1`. The tag must match the package version and refer to a commit on main with successful CI. Already published versions cannot be republished; create a new version when changing package contents.

The [release workflow](.github/workflows/release.yml) builds without npm publishing credentials, then publishes the resulting tarball in a separate job with lifecycle scripts disabled. It uses [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) rather than an npm token. Configure the npm package's Trusted Publisher once with GitHub owner `rdlabo-dev`, repository `workers-capacitor`, workflow filename `release.yml`, no environment name, and permission to publish directly. No `NPM_TOKEN` secret is required.

### PR beta requests

After Compatibility succeeds for an open, non-draft PR targeting main, a repository admin or maintainer can post a comment containing exactly `/beta`. This also supports fork PRs. The request publishes that PR head to `beta` without merging it; it never updates `latest`.

The workflow checks the requester's current permission, the PR head and its CI again in the publishing job. A PR updated after the comment requires successful CI and a fresh `/beta`; queued comments do not authorize newer changes. PRs modifying `.github/workflows/` or `.github/scripts/` must merge those changes before using this command. The candidate is built in the read-only job; its source and lifecycle scripts are never executed in the OIDC publishing job.

The command becomes available after `release.yml` lands on main. A failed request can be inspected in the Release workflow's Actions log; it does not publish when CI is pending or failed.
