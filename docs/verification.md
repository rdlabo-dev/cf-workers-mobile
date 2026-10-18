# PoC verification — 2026-10-16

This document records historical verification runs and subsequent implementation stages. Results and limitations belong to the stage where they are reported; they are not a single report for the current demo. See the [current demo guide](../demo/README.md) for its layout and commands.

## Upstream application check: honojs/examples `jsx-ssr` — 2026-10-17

On `test/upstream-hono-jsx-ssr` (base `722c31f`), the unmodified upstream example [honojs/examples `jsx-ssr`](https://github.com/honojs/examples) runs in Capacitor document rendering. The upstream repository is cloned read-only at pinned commit `3b0b62875a0e1265763fea1c6388866d5697ef81` (MIT; no LICENSE file exists upstream — the repository README states MIT) into the git-ignored `demo/artifacts/upstream/hono-jsx-ssr/clone` via a blob-filtered sparse checkout limited to `jsx-ssr/`. No upstream file is committed or edited. Setup, provenance and case lists live in `demo/tests/upstream/hono-jsx-ssr/`; preparation and native runs are `npm run test:upstream:{prepare,workerd}` and `test:upstream` from `demo/`.

Dependency delta: upstream declares `hono ^4.2.4` and `wrangler ^3.53.0` without a lockfile. The workerd baseline and the consumer use `hono 4.13.13` (inside the declared range, matching this repository); workerd runs under Wrangler 4.151.0 with the upstream `compatibility_date` 2024-04-01. No newer Hono feature is required; the sample uses only `Hono`, `c.html`, `c.req.param`, `c.notFound`, `hono/jsx` and `hono/html`. Upstream tooling delta: its `dev`/`deploy` scripts and `wrangler.toml` deploy name are unused — no Cloudflare deployment was performed.

| Check                  | Result             | Method                                                                                                                            |
| ---------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Local workerd baseline | 6/6                | `npm run test:upstream:workerd`: HTTP status+body for `/`, `/post/1`, `/post/5` (UTF-8), `/post/99`, `/post/abc`, `/no-such-path` |
| Android 16 emulator    | 14/14 + visual 404 | `npm run test:upstream -- hono-jsx-ssr android emulator-5554`, execution `worker`                                                 |
| iOS 26.1 Simulator     | 14/14 + visual 404 | `npm run test:upstream -- hono-jsx-ssr ios 8036B54D-3A66-4DB2-875D-96495139F883`, execution `worker`                              |

The consumer is an independent temp project (`demo/artifacts/upstream/hono-jsx-ssr-consumer.json`) installing the `npm pack` tarball; the plugin registered through ordinary `cap add`/`cap sync` on both platforms with no native overlay or controller/Activity changes. The workerd assertions verify HTTP status and bodies; the native probe verifies the rendered document for `screen:` cases, transport status/body for `fetch:` cases and one `iframe:` supplement. The runner requires the exact declared case set (`upstream.json` `probeCases`) — a partial report fails. After reporting, the probe performs a real top-level navigation to `/post/99`; that `text/plain` page runs no script, so it is verified only by screenshot (`*-404.png` shows the upstream "404 Not Found" body), recorded separately from the structured cases. Evidence: `demo/artifacts/upstream/hono-jsx-ssr/` contains `{android,ios}-hono-jsx-ssr.json` and matching `-report.png`, `-404.png`, and `-console.log` files (git-ignored).

The upstream layout loads mini.css from cdnjs; these runs do not establish fully offline styling.

No library defect was found for this sample: the same upstream entry matched the asserted page content, links, UTF-8 and 404 responses in workerd and in both native WebViews, including fresh-document link navigation and back history. This is a compatibility verification, not a bug fix. One visual finding: on iOS the unmodified upstream page rendered under the status bar. Investigation showed the document controller follows the standard Capacitor layout (`CAPBridgeViewController`, view bounds, `ios.contentInset` default `never` = edge-to-edge), so safe-area handling is the application's own responsibility, not a lost library behavior. A separate opt-in run used the public `ios.contentInset: "automatic"` — the document controller reads the same bundled config key as the host (`CAPInstanceDescriptor.swift` → `CAPBridgeViewController.swift:302`) — and the re-run confirmed the upstream text clears the status bar in the visually inspected screenshots. No library or upstream change was needed. The fixture was subsequently restored to the default (no `contentInset` setting); `automatic` is documented only as an application option. The initial default run and the opt-in run both passed 14/14. The saved iOS screenshots show the opt-in run, not the restored default. Regressions run: root typecheck, 132/132 unit tests, demo typecheck, 58/58 existing workerd tests, 6/6 upstream workerd checks re-run. Browser/Playwright and the 50-case packaged suite were not re-run; the change adds files under `demo/tests/upstream/`, two scripts and one Vitest config without touching library, demo sources, or existing fixtures.

### iOS Safe Area default and application override

After the initial upstream checks above, the native document controller was changed to use automatic content insets when `ios.contentInset` is omitted. Explicit values continue through Capacitor's standard configuration parser unchanged, including `never`. Fetch-only host behavior is unchanged. The preceding no-library-change statements describe the initial investigation, not this subsequent native change.

A fresh packed consumer (`workers-capacitor-upstream-hono-jsx-ssr-dBpDPM`) compiled the updated Swift source and passed all 14 upstream cases on iOS 26.1 twice: with the setting omitted and with explicit `never`. Visual inspection of the final top-level 404 screenshots confirmed that the default clears the status bar and explicit `never` restores edge-to-edge placement. Reports, console logs and screenshots for each configuration are retained under `demo/artifacts/upstream/hono-jsx-ssr/safe-area-{default,never}/`. The consumer configuration and top-level evidence files were restored to the omitted-setting default after comparison. The installed simulator binary remains the explicit-`never` comparison build until the next native run.

The library build and native Swift compilation passed. Android, the existing 50-case Hono/Express suite, and physical devices were not rerun for this iOS layout-only change. See [the public configuration guide](native-rendering-api.md#ios-safe-area).

### Automated upstream CI gate

The same branch adds a separate `upstream` job to the aggregate `CI` gate. Local reproduction of its commands passed after clean root/demo `npm ci`, a library build, and a fresh sparse clone: six shared workerd cases and 24 Vite-built Chromium/WebKit checks (six routes × two execution modes × two browsers). Both modes are explicitly asserted; the browser checks inspect Fetch Handler responses and do not claim native document navigation. Typechecking, `actionlint`, and diff checks pass. A temporary edit to the generated upstream clone was rejected by the source guard; restoring the original bytes restored acceptance.

The job uses committed lockfiles and the source SHA/Hono version from `upstream.json`, and retains JSON reports plus failure screenshots/traces. A failed/skipped/cancelled upstream job cannot pass the aggregate gate. This workflow has been validated locally; GitHub-hosted Linux execution is pending publication. The native runs above precede these CI-only changes and were not repeated.

### Next candidate memo: cloudflare/templates `to-do-list-kv-template`

Investigated at commit `dfdf14099a81a08cfe1ffc78f8463605670ae513` (MIT, `LICENSE` at repo root). This is a **Remix 2.17.2** app (`@remix-run/cloudflare` `createRequestHandler`, React 18, Tailwind), unlike the self-contained Hono sample — substantially different reach:

- Entry `server.ts` is a `{ fetch }` object that injects `request.cf`, `ctx.waitUntil`, **`ctx.passThroughOnException`** and global **`caches`** into the Remix load context. `passThroughOnException` is bound eagerly (`ctx.passThroughOnException.bind(ctx)`), but this library already supplies the method in direct and isolated execution; it throws only when called. Binding it alone is not a demonstrated incompatibility. Actual use of this method, `caches`, and `request.cf` still needs runtime verification.
- KV binding `TO_DO_LIST` (`kv.get(key,"json")`, `kv.put` with `expirationTtl: 300`). Native runs would need an `env` binding such as `LocalStorageKV`, whose method-bearing API causes direct execution to be selected; workerd tests can use a real `kv_namespaces` binding.
- `wrangler.jsonc` serves Workers **static assets** from `build/client`; in Capacitor these map to bundled `webDir` assets instead — an assets-manifest mapping decision, not a Worker change.
- The entry imports generated `./build/server`; the consumer must run `remix vite:build` (upstream ships `package-lock.json`, so the toolchain pins exactly — heavier than the jsx-ssr prepare).
- Flow to verify: `/` → `nanoid` redirect to `/{id}` (document-level 302), SSR list, POST `intent` create/toggle/delete actions, KV round trip, hydration scripts from the served assets. Remix hydration adds client-side routing beyond plain document navigation.
- `nodejs_compat` flag is declared; whether the bundled server needs Node APIs must be confirmed against the built bundle.

Suggested order next task: workerd baseline with a real KV namespace → reproduce `passThroughOnException`/`caches`/`cf` expectations → decide env/KV strategy (direct mode) → consumer with Remix build + asset manifest mapping.

The initial PoC was implemented on branch `poc/workers-webview`. No cloud deployment or npm publication was performed.

## Results

| Environment                       | Result                           | Evidence                                                  |
| --------------------------------- | -------------------------------- | --------------------------------------------------------- |
| TypeScript                        | Passed                           | `npm run typecheck`                                       |
| Runtime unit tests                | 7/7                              | `npm test`                                                |
| Chromium                          | 26/26 + 18/18 offline API checks | `npm run test:browser`                                    |
| WebKit                            | 26/26 + 18/18 offline API checks | `npm run test:browser`                                    |
| Local Cloudflare workerd          | Hono 9/9; Express 9/9            | `artifacts/workerd-results.json`                          |
| Fresh npm-tarball consumer        | 26/26                            | `artifacts/package-results.json`                          |
| iOS 26.1 Simulator, iPhone 17 Pro | 26/26                            | `artifacts/ios.png`, visually inspected                   |
| Android 16 emulator               | 26/26                            | `artifacts/android.png`, `artifacts/android-results.json` |

Native builds use Capacitor 8.5.3 and bundled assets, without `server.url`. Both platform screenshots show the actual platform and every successful check. Native physical devices and cloud-hosted Workers were not tested. Local workerd is sufficient for this first API compatibility check; any later live deployment should use the requested `rdlabo-dev` account.

In that initial run, the same Hono and Express contract Workers ran in workerd and the WebView. Those handlers are now retained in `demo/tests/fixtures/workers/hono/standard.ts` and `demo/tests/fixtures/workers/express/standard.ts`. They are separate from the current minimal examples under `demo/src/workers/`. That run used Express 5.3.0 and Hono 4.13.13. The common API contract covered GET/query, POST/Unicode JSON/status, nested routing, middleware headers, 404, error middleware, 204, HEAD and concurrent calls. WebView checks added Request input, URL mapping, env, waitUntil success/failure and original-fetch passthrough.

In that native validation run, `baseURL` pointed at `https://worker.invalid/api/`. No API server can satisfy that URL. Browser tests observe zero network requests to the API and repeat the API contract with networking disabled.

## Findings

- Express needs more than a fetch wrapper. Its Workers `cloudflare:node` bridge and Node HTTP objects need a browser build adapter. The PoC implements only the required in-memory server/request/response surface.
- Correct socket lifecycle flags are necessary for `express.json()` to read bodies. Express's 404 path also needs `setImmediate`. Both failures were found by the integration tests and fixed.
- iOS custom-scheme URLs need protocol/host comparison. Comparing only `URL.origin` would mishandle opaque origins; a unit test covers this case.
- Combined minified demo JavaScript: approximately **1,481 kB**, **489 kB gzip**. This includes both frameworks, broad Node polyfills and the test UI. It is not the standalone core size, nor an optimized release. Narrowing Express dependencies is future work.
- The build reports an `eval` warning from transitive `vm-browserify`. Strict-CSP compatibility has not been established.
- After updating the test runner, npm audit reports **0 high/critical**, **3 moderate and 6 low** dependency findings. Remaining chains involve Capacitor CLI's `xcode`/`uuid` and the browser crypto polyfills. This PoC is not release-hardened; do not use the experimental compatibility layer as a cryptographic compatibility guarantee.
- D1, KV, R2 and automatic Wrangler binding setup are intentionally unimplemented. Express streaming, arbitrary middleware/Node APIs, cloud secrets and cloud data synchronization are outside the tested contract.

Screenshots, build products and raw results are local ignored artifacts. The reproduction scripts and generated native project sources are retained in the repository.

## Adversarial review follow-up

The review found that a double-slash pathname could override the configured Worker origin. URL construction now assigns pathname and query separately. A second failure reproduced an uncaught exception and pending fetch when asynchronous Express response headers could not be converted; header conversion is now inside the existing rejection boundary.

Both cases have regression tests. Build, typecheck, seven unit tests, Chromium and WebKit (26 checks plus 18 offline API checks each) pass after these fixes. The native screenshots above are from the initial PoC run; native builds were not repeated for these two targeted fixes.

## Demo project layout

The validation app now lives entirely under `demo/`, with independent dependencies and a lockfile (no npm workspace). Run browser/workerd tests and Capacitor commands from that directory. The library build, unit tests and npm tarball consumer test remain at the repository root. Historical artifact paths above refer to their original runs.

The boundary review copied the library into a temporary directory without demo or native projects: clean install, build, typecheck and all seven unit tests passed. The independent demo then passed its own clean install, typecheck and build. Chromium/WebKit, local workerd and the fresh tarball consumer tests also passed after the separation. Capacitor sync regenerated Android's dependency path against `demo/node_modules`, not the root installation. The combined demo now measures approximately 1,533 kB minified (about 505–507 kB gzip), distinct from the initial measurements above.

## Workers test runner and CLI migration

The handwritten workerd runner has been replaced by Vitest 5.0.5 in the independent demo package. `npm run test:workers` reports 18 individual passing tests (nine each for Hono and Express), and demo typechecking passes. Wrangler's official `createTestHarness` manages runtime startup and cleanup without fixed ports or custom readiness polling. This run does not generate the historical `workerd-results.json`; use Vitest's reporters when machine-readable results are needed.

Cloudflare CLI `cf` 1.0.0-beta.17 uses `demo/cloudflare.config.ts`, selecting Hono or Express with `--mode`. Both `cf build --mode hono` and `cf build --mode express` pass. The previous Wrangler JSON configuration files have been removed. Wrangler 4.151.0 remains the CLI's build engine and provides the test harness API. Native application code is unchanged by this migration.

## Fetch execution pattern — 2026-10-16

On `refactor/fetch-runtime-pattern`, the existing fetch behavior is now the `FetchRuntime` template. Direct and isolated implementations extend it; the public installer only selects and installs the runtime. No binding implementation is included in this branch. See [the extension recipe](fetch-pattern.md).

The shared suite in `tests/contracts/fetch.ts` runs the same 15 cases against direct installation, isolated installation and a minimal subclass with no global installation. HEAD source cancellation is observed asynchronously so both execution modes satisfy the same observable contract. The pending-handler abort case now waits for actual handler entry before aborting. Implementation-specific tests remain separate.

| Check                                 | Result                                                            |
| ------------------------------------- | ----------------------------------------------------------------- |
| Root/demo typecheck and library build | Passed                                                            |
| Root Vitest                           | 64/64, including 15 shared cases × 3 implementations              |
| Local workerd                         | 23/23 (Hono 10, Express 10, isolation 3)                          |
| Chromium/WebKit ordinary demo         | 4/4 Playwright cases                                              |
| Chromium/WebKit isolated demo         | 22/22 Playwright cases                                            |
| Vite development Hono/Express         | 4/4                                                               |
| Fresh npm-tarball consumer            | Direct 26/26, isolated 22/22; FetchRuntime subclass types compile |
| iOS 26.1 Simulator, iPhone 17 Pro     | 28/28                                                             |
| Android 16 emulator, WebView 134      | 28/28                                                             |

Native builds use bundled assets without a development server. Each native run covers six neutral runtime checks and eleven checks per unchanged Hono/Express Worker. Logs, JSON reports and visually inspected screenshots are local ignored files at `demo/artifacts/native-fetch-pattern-{ios26,android}.{log,json,png}`. This validates simulator/emulator WebViews, not physical devices or production Cloudflare. The ordinary demo assets/configuration were restored after the native experiment. No cloud deployment or package publication was performed.

## Common feature standard — 2026-10-16

On `feat/common-feature-foundation`, a typed profile connects API, declared behavioral coverage, implementation and contract suite. The common host owns initialization rollback and reverse-order, idempotent cleanup. The runner uses a fresh scope for each supported case and distinguishes passed, failed, unsupported and unavailable outcomes. See [the common feature standard](feature-standard.md).

Three profiles exercise the same machinery: portable HTTP behavior (direct and isolated fetch), a test-only memory text store compared with actual local Workers KV, and WebAssembly validation compared with workerd. The library contains the generic host/testing layer and fetch connector; state/engine fixtures and native projects remain in the independent demo. No full KV adapter, TTL/metadata/listing support, native persistence, V8 embedding or cloud synchronization is claimed.

| Check                              | Result                                                                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Root/demo typecheck, library build | Passed                                                                                                                            |
| Negative type tests                | Reject missing/wrong operations, wrong arguments/results, mismatched feature/API identities and missing/invented cases            |
| Root Vitest                        | 74/74, including lifecycle and result-policy tests                                                                                |
| Local workerd Vitest               | 25/25; two new tests execute nine shared HTTP/KV/engine cases against actual runtime facilities                                   |
| Chromium/WebKit ordinary demo      | 4/4                                                                                                                               |
| Chromium/WebKit isolated demo      | 24/24; each browser runs all 13 common feature cases                                                                              |
| Vite development Hono/Express      | 4/4                                                                                                                               |
| Fresh npm tarball consumer         | Direct 26/26, isolated 22/22, common profiles 13/13; public declarations preserve API typing and reject incorrect implementations |
| iOS 26.1 Simulator, iPhone 17 Pro  | 41/41                                                                                                                             |
| Android 16 emulator, WebView 134   | 41/41                                                                                                                             |

The 41 native checks are the existing 28 plus 13 common cases (HTTP 4 × direct/isolated, text storage 3, engine 2). Native checks use bundled assets; logs, JSON reports and visually inspected screenshots are saved locally as `demo/artifacts/native-feature-standard-{ios26,android}.{log,json,png}`. These are simulator/emulator WebViews, not physical devices. The KV reference uses local workerd storage, not a production Cloudflare namespace. The memory provider is a nonpersistent verification fixture. Normal demo assets/configuration were restored after native testing. No npm publication or cloud deployment was performed.

Manager review reproduced reentrant disposal from a synchronous abort listener. The host now establishes its shared disposal promise before notifying listeners. A regression test verifies promise identity and exactly-once asynchronous cleanup; all 74 root tests, typechecking and build pass. Native results above predate this focused lifecycle correction; native builds were not repeated for it.

## Persistent text KV — 2026-10-16

`feat/kv-text-storage` adds `LocalStorageKV` and the exported `kv.text.v1` profile. The demo memory fixture is replaced by a persistent Web Storage adapter. Six shared cases run against that adapter and actual local workerd KV. An unchanged HTTP Worker is separately exercised with both bindings. Application data survives feature disposal; test fixtures delete only their own data.

| Check                              | Result                                                                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library build, root/demo typecheck | Passed                                                                                                                                                   |
| Root Vitest                        | 80/80; includes namespace/lifecycle persistence, unsupported options, UTF-8 key bounds, capacity/access errors, unavailable storage and oversized writes |
| Local workerd                      | 26/26, including Hono/Express, six shared KV cases and KV HTTP handler                                                                                   |
| Chromium/WebKit experiment         | 26/26, including Hono/Express and document reload persistence/isolation/deletion                                                                         |
| Fresh tarball consumer             | Direct 26/26, isolated 22/22, common feature cases 16/16                                                                                                 |
| iOS 26.1 Simulator                 | 44/44                                                                                                                                                    |
| Android 16 emulator / WebView 134  | 44/44                                                                                                                                                    |

Native runs cover the existing 28 checks plus 16 common feature cases. Before those common cases, the runner also verifies writes through the KV Worker survive feature disposal/recreation. The document reload test was performed in Playwright Chromium/WebKit, not via native application restart. Native logs, JSON and inspected screenshots are local ignored files under `demo/artifacts/native-kv-{ios26,android}.*`. Native assets were restored to the ordinary demo configuration after testing. No physical device, cloud deployment or npm publication was involved.

This is a direct-execution, default-text subset. TTL, metadata, listing, binary/JSON/stream modes, isolated binding RPC and cloud synchronization remain unimplemented. Storage limits and semantics are documented in [KV setup and scope](kv.md).

### Reusable contracts and implementation guardrails

HTTP/KV suites now ship through `cloudflare/workers/testing` and `cloudflare/bindings/kv/testing`, with the HTTP Worker fixture exported alongside its contract. The demo imports these public subpaths for both WebView and actual workerd verification. KV runtime validation remains inside `LocalStorageKV`; implementation-specific rejection, persistence and quota tests remain separate from the portable Workers contract. A deliberately broken write implementation confirms that the published KV suite detects lost writes.

After extraction: library build, root/demo typecheck, 81 root tests, 26 local workerd tests, 26 Chromium/WebKit experiment tests and the fresh tarball consumer (direct 26, isolated 22, common 16) all pass. The consumer additionally typechecks both new public subpaths and rejects a KV implementation paired with the HTTP suite. Native binaries were not rebuilt for this test-module extraction; the 44/44 native results above describe the preceding KV implementation run.

## Extended local KV binding — 2026-10-16

The local KV profile now includes text/JSON/ArrayBuffer/stream reads, bulk text/JSON reads, getWithMetadata, byte/stream writes, metadata, expiration and cursor-based listing. Runtime validation remains in the storage implementation. The common host and runner require no KV-specific changes. Sixteen public contract cases run unchanged against local Web Storage and actual workerd KV.

Workerd exposed a useful compatibility distinction: bulk getWithMetadata returns null for a missing map entry, whereas a missing single read returns an object with null value and metadata. Both implementation and types reflect this behavior; a separate regression distinguishes a stored JSON null from a missing record.

Validation: library build and root/demo typechecks pass; root Vitest 87/87; actual local workerd 27/27 (including a 61-second wait confirming real expiration); Chromium/WebKit 26/26; packed consumer direct 26/26, isolated 22/22 and common features 26/26, with negative public type tests. Guardrail tests cover invalid options and bounds, stream failure/oversize cancellation without overwriting existing data, metadata snapshots, expiration boundaries, cursor scope and deletion while paging. Hono and Express checks remain explicit in workerd/browser/native suites.

The completion boundary is the documented local binding API, not distributed Cloudflare semantics, cloud synchronization or isolated binding RPC. See [KV scope](kv.md). No production deployment or package publication was performed.

Final native verification passes 54/54 on iOS 26.1 Simulator and Android 16 emulator (WebView 134): existing 28 plus 26 common cases. The runner additionally verifies bytes, metadata and expiration survive feature disposal/recreation together. Logs, JSON and inspected screenshots are saved locally as `demo/artifacts/native-kv-complete-{ios26,android}.*`. Android needed a clean Gradle build after Capacitor sync invalidated an intermediate resource file, followed by an app relaunch after emulator reconnection; the final result is from the rebuilt app. The emulator also displayed a System UI not responding dialog after the 54 passing checks; this is recorded as an environment limitation rather than a clean end-to-end UI stability result. Normal demo assets were restored after native builds. These results do not imply physical-device or cloud production validation.

### Devin review follow-up

Two findings were confirmed and fixed: TTL was measured before asynchronous stream collection, and read-mode parsing recursively accepted nested objects. Expiration options are now captured at invocation; relative TTL starts after collection/encoding, while an absolute expiration elapsed before publication rejects without replacing the old value. Read types are validated as scalar enum strings, including dynamic/cyclic malformed input.

Regression checks cover a stream completed after 61 simulated seconds, mutation of the original options during collection, expired absolute writes preserving old value/metadata, and malformed modes across single/bulk get/getWithMetadata. Root tests 90/90, root/demo typechecking, library build, targeted Chromium/WebKit checks 4/4 and packed-consumer direct 26/26, isolated 22/22, common 26/26 pass. Native and workerd results above predate these focused guardrail fixes and were not repeated for this follow-up.

### Manager and third-party acceptance review

Both review cycles completed with no remaining revision requests after correcting leading U+FEFF handling. The manager independently reproduced identifier collisions: a BOM-prefixed key overwrote the ordinary key, and a BOM-only key broke listing. Third-party workerd probes also found distinct single/bulk value semantics. Keys retain BOM; single text reads retain it and single JSON reads reject BOM-prefixed JSON, while bulk text/JSON reads strip it. The implementation now uses separate single/bulk decoders.

Two public contract cases cover key isolation, prefix listing and deletion, plus all eight single/bulk × text/JSON × get/getWithMetadata combinations. The KV profile now has 18 cases. Root tests 90/90, root/demo typechecking, library build, local workerd 27/27 (including the real TTL wait), Chromium/WebKit 26/26 and packed-consumer direct 26/26, isolated 22/22, common 28/28 pass on the final review fixes. Both reviewers independently rechecked the implementation and new contracts. Native runs were not repeated for these focused fixes; the earlier 54/54 results and Android System UI limitation remain historical evidence, not validation of the final BOM changes.

## Configured execution preference — 2026-10-16

`feat/execution-preference` adds a Vite-configured source, lazy direct loading and `prefer: "worker" | "direct"` (worker by default). Selection occurs before dispatch; unavailable Worker constructors and method-bearing env bindings select direct execution. Startup script errors and request errors never replay in another environment. See the selection boundary in [fetch-pattern.md](fetch-pattern.md).

Validation: root/demo typechecking and build pass, unit tests 97/97, Chromium/WebKit production 34/34 and development 12/12 (including explicit existing Hono/Express regressions). Fresh npm consumer passes direct 26/26, isolated 22/22, common profiles 28/28 and configured preferences 2/2. Final conservative constructor/prototype checks also pass unit tests and the native iOS run.

The final iOS 26.1 Simulator build displays **PASS 59/59**, visually confirmed in `demo/artifacts/native-preference-ios.png`. This includes the existing 56 runtime/framework/common-profile checks plus worker preference, direct preference and method-bearing env fallback. The console capture did not contain the structured result; the screenshot is the acceptance evidence. No physical device was tested.

Android builds successfully. The emulator intermittently stopped responding to shell/package-manager commands; the final APK install did not complete and its client was stopped. Android execution is **unverified** for this change, not counted as passing. Normal demo assets/configuration were restored after native attempts. No cloud deployment or PR publication was performed for this change.

### Devin review follow-up: initialization and env preservation

Both reported defects were reproduced before correction: a dynamically imported module with top-level local `await fetch()` deadlocked `ready`, and non-enumerable/null-prototype env values incorrectly selected worker execution. During direct-module loading, matching requests now reject explicitly; applications must await `runtime.ready` before issuing UI requests. The runtime cannot distinguish initialization calls from concurrent UI calls. Non-enumerable custom properties and null-prototype objects select direct execution; ordinary array length remains eligible.

Validation after correction: root/demo typechecks, build, 102 unit tests, Chromium/WebKit production 38/38 and development 16/16, packed consumer direct 26/26, isolated 22/22, common 28/28 and preferences 2/2. Tests use real top-level-await modules, preserve env values/identity in direct mode, verify ordinary arrays/cycles through the actual structured-clone transport, and verify aborted startup requests never replay. Native tests were not repeated for this follow-up; the preceding iOS 59/59 result is historical, and Android execution remains unverified.

## Demo and validation separation — current PR

The examples under `demo/src/workers/{hono,express}/standard.ts` return HTML at `/` and JSON at `/api/hello`. Browser tests build the same demo with each Worker selection; local workerd checks both example endpoints. Broader routing, middleware, errors, and response-semantics checks use the separate contract Workers under `demo/tests/fixtures/workers/` in both workerd and WebView/browser verification apps.

After this separation and the HTML example update, the browser suite passed 8 tests and the local workerd suite passed 31 tests. These results do not replace the historical native evidence above: native OS launch was not rerun for this PR. The demo currently inserts returned HTML into an existing document; full document loading, returned script execution, navigation, and form submission remain separate work.

## Packaged native lifecycle — 2026-10-17

Verified on `test/packaged-native-lifecycle`, based on `4b88028b4eb49dbecc669dc9293586e745951895`, with uncommitted test/documentation changes. Production TypeScript and native sources are unchanged from that commit. The independent consumer installs the npm tarball with Capacitor 8.5.3; no native source overlays are applied.

| Environment                                | Hono                         | Workers Express              |
| ------------------------------------------ | ---------------------------- | ---------------------------- |
| iOS 26.1 Simulator                         | 50/50 + all lifecycle stages | 50/50 + all lifecycle stages |
| Android 16 emulator, WebView 155.0.8059.43 | 50/50 + all lifecycle stages | 50/50 + all lifecycle stages |

Each run verifies background/foreground, process termination/relaunch, updated Worker and static assets installed without deleting app data, and shutdown/reinitialization. iOS uses public `dispose()` and startup from the retained host; Android uses native stop and Service Worker bootstrap, followed by Fetch-only migration/registration cleanup/native asset fallback. The runner backgrounds the app before termination to allow WebView storage to persist; abrupt crashes and power loss are not covered. Physical devices and native execution in CI are not claimed.

The final four reports and console/build logs are local artifacts in `/private/tmp/claude/workers-capacitor-native-package-hiXuCf/artifacts/`, named `{ios,android}-{hono,express}.json` and corresponding logs. `demo/artifacts/native-package-consumer.json` points to the consumer; see [the test guide](../demo/tests/README.md#packaged-native-rendering-api) for reproduction commands. All four reports contain no failed acceptance cases and passing background/relaunch/update/reinit/complete stages.

Review-time checks: root/demo typechecking, library build, all 132 unit tests, changed JavaScript syntax checks, and `git diff --check` pass. Native results above are from the final lifecycle test code, before this documentation-only record was added.

### Upstream probe rerun isolation — Devin follow-up

Each native invocation now generates a fresh run ID asset before building. The probe preserves session progress only for that ID, and the runner requires the same ID in the report. Chromium/WebKit regression cases seed completed and interrupted previous runs and verify a fresh run starts, while current-run navigation retains progress. The upstream browser suite passes 30/30, demo typechecking and script syntax checks pass. Two consecutive runs in the same packed iOS 26.1 consumer pass 14/14 each; Android was not repeated for this test-driver-only change.
