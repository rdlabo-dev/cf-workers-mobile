# Compatibility CI and merge protection

`.github/workflows/ci.yml` runs on every pull request, pushes to main, merge queues and manual dispatch. There are no path filters, secrets or privileged pull-request triggers. Official actions are pinned to commit SHAs; the token is read-only and checkout does not persist credentials. Node 22 matches the current local validation baseline.

| Job           | Required evidence                                                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| library       | Strict typechecking including negative type tests, library build, unit/contract tests                                                                                                     |
| compatibility | Independent demo install/typecheck, actual local workerd (explicit Hono/Express and shared profiles), Chromium/WebKit production tests, isolated runtime tests and Vite development tests |
| package       | Fresh npm tarball consumer: exported types and direct/isolated/common-profile browser checks                                                                                              |
| upstream      | Pinned official Hono source, clean-clone/version checks, local workerd baseline, Vite build and Chromium/WebKit Fetch-only checks in direct and Worker execution                          |

`CI` aggregates all four jobs. It runs even if a dependency fails and accepts only `success` from every dependency; failed, cancelled and skipped jobs cannot produce a passing gate. Vitest rejects focused tests through `--allowOnly=false`; Playwright rejects them when `CI` is set. Playwright uses one worker on CI to limit resource contention. The demo remains an independent package, not an npm workspace.

The shared profile integrations require every declared case to pass. The generic `assertContract` intentionally permits explicit partial coverage; it alone is not proof of full profile compatibility. Removing cases or weakening assertions still requires human review.

## Repository setting required after publication

A workflow by itself does not prevent merging. Configure a main branch ruleset after the workflow has produced its first check:

- Require a pull request before merging.
- Require the `CI` status check from GitHub Actions and an up-to-date branch.
- Block force pushes and branch deletion; apply the rule without routine bypasses.
- Do not require a second maintainer's approval by default for a single-maintainer repository.

These settings are not applied by the workflow. At review time, main had no branch protection and the repository had no rulesets. Repository settings require separate maintainer authorization. A required check cannot prevent an authorized contributor from weakening the workflow itself; review workflow and contract changes explicitly.

## Verification boundary

Linux Chromium/WebKit and local workerd are automatic gates. They do not establish iOS/Android native WebView behavior, physical-device behavior, cloud deployment behavior, cloud synchronization or full V8 compatibility. Native validation remains a separate acceptance step for transport/runtime/platform-affecting changes. Record the tested commit, OS/WebView versions and actual results in `verification.md`; do not carry earlier native passes forward as evidence for later code.

No simulator/emulator job is claimed here: the existing manual native procedure has not yet been reproduced on GitHub-hosted runners. The packed consumer intentionally installs into a fresh temporary project; it tests package usability separately from the lockfile-controlled library/demo installs.

`.github/workflows/codeql.yml` separately analyzes GitHub Actions, JavaScript/TypeScript and Java/Kotlin. Swift CodeQL is excluded because its macOS build cost and latency are impractical for this project. iOS native build and acceptance verification remain local `test:native:package` runs on a developer machine; removing Swift CodeQL does not replace those checks.

## Official upstream sample gate

The `upstream` job checks `honojs/examples/jsx-ssr` at the full commit SHA in `demo/tests/upstream/hono-jsx-ssr/upstream.json`. Each job starts with a fresh sparse clone. Library and demo dependencies come from `npm ci` using their committed lockfiles; the installed Hono version must also match the sample metadata. Update the source pin and dependency versions explicitly in a PR. Upstream files are not vendored or modified.

Six shared status/content expectations run against the original entry in local workerd and against the Vite-built public adapter in Chromium/WebKit, with both `direct` and `worker` execution (24 browser checks). The test actually asserts which execution mode was selected, so fallback cannot masquerade as isolated execution. This browser gate exercises Fetch Handler compatibility, not native document navigation, Safe Area layout, or iOS/Android lifecycle behavior. Those remain covered by the separate local native procedure.

The job uploads the source-pin metadata, JSON test reports, and failure screenshots/traces for seven days, including on failure. Build/clone failures are available in the Actions step logs. A failure, cancellation, or skipped upstream job prevents the aggregate `CI` check from passing. No secrets, deployments, or simulator jobs are added. The independent native consumer still resolves its own dependencies through `npm install`; it is separate from this lockfile-controlled CI gate.
