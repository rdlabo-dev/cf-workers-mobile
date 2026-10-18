# Fetch adapter and runtime investigation

Investigated on 2026-10-16. This is a scoped compatibility investigation, not a claim of complete Workers compatibility. The sections below retain the experiment history; **Library integration** at the end describes the current implementation.

## Hono reference

The [Service Worker guide](https://hono.dev/docs/getting-started/service-worker) uses a browser FetchEvent to dispatch to app.fetch. The browser supplies the execution environment. The installed Hono 4.13.13 adapter passes the Request and event context to app.fetch, with optional network fallback on 404. The current guide names @hono/service-worker; the source comparison here specifically used the installed hono/dist/adapter/service-worker/handler.js.

We retain the small dispatch boundary, without adding a Hono dependency. We intentionally do not copy 404 fallback: a local failure must not implicitly retry against a remote backend.

## workerd reference

Source revision: 40838ae3f72038c15ef9ed381f9d51880476ebb0.

| Responsibility                                                | Reference                                                                                                                                | WebView implementation / gap                                                                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Worker isolate and modules                                    | [worker.c++](https://github.com/cloudflare/workerd/blob/40838ae3f72038c15ef9ed381f9d51880476ebb0/src/workerd/io/worker.c++)              | Imported Worker shares globals with the UI; no isolate or module loader.                                                                 |
| Request I/O ownership, outbound channels, background lifetime | [io-context.h](https://github.com/cloudflare/workerd/blob/40838ae3f72038c15ef9ed381f9d51880476ebb0/src/workerd/io/io-context.h)          | Fresh context plus tracked promises; no per-request I/O isolation or resource limits.                                                    |
| waitUntil and exception passthrough                           | [global-scope.c++](https://github.com/cloudflare/workerd/blob/40838ae3f72038c15ef9ed381f9d51880476ebb0/src/workerd/api/global-scope.c++) | Promise tracking only; passthrough explicitly unsupported.                                                                               |
| Fetch, redirects, body handling                               | [http.c++](https://github.com/cloudflare/workerd/blob/40838ae3f72038c15ef9ed381f9d51880476ebb0/src/workerd/api/http.c++)                 | Browser Request/Response plus URL mapping. Redirect following, cookie policies, and aborting response streams after headers remain gaps. |

workerd's [README](https://github.com/cloudflare/workerd/blob/40838ae3f72038c15ef9ed381f9d51880476ebb0/README.md) describes a native server runtime and lists Linux, macOS and Windows as tested platforms, not iOS/Android. “JavaScript/Wasm runtime” means it executes these programs, not that it ships a browser-compatible Wasm runtime. Mobile embedding would need a separate native port/build/bridge investigation. We did not build such a port or establish that it is impossible.

## Dispatch contract tightened in this change

- Relative URLs use document.baseURI, with location fallback when there is no document. Intercepted URLs retain path/query and map to the configured origin; credential-bearing URLs reject.
- Outside requests retain their original input and init. Local 404/500/errors never retry remotely.
- Aborting before the scheduled handler invocation prevents execution. Pending handler calls reject on abort; arbitrary application work cannot be forcibly stopped.
- HEAD drops and cancels a handler's returned body while retaining status/headers. Error responses and used/locked bodies reject.
- Tests cover env identity, per-invocation contexts, nested background tasks and delegation of untouched Request objects.

## Historical gap before isolated mode (still applies to direct mode)

Before isolated mode, UI and Worker code saw the same patched global fetch. This remains true only for direct handler imports. Worker subrequests inside the configured interception boundary re-enter the local handler and may recurse. Outside requests use WebView networking, including browser CORS/cookie behavior. This differs from workerd's outbound I/O channels.

Temporarily restoring global fetch while a handler runs would break concurrent UI requests and background work. The investigation therefore evaluated a dedicated Web Worker to separate globals, requiring a module entrypoint and Request/Response transport, including streams, aborts and errors. It is not a workerd isolate. The experiment measured target WebView support before adoption. The subsequent Library integration section describes the implemented isolated mode.

## Dedicated Web Worker experiment

`demo/tests/fixtures/apps/runtime/` imports the unchanged `demo/tests/fixtures/workers/runtime/isolation.ts` module in a separate global scope. The UI installs the existing adapter with a small MessageChannel bridge. Requests carry URL/method/headers and a buffered body; responses carry status/statusText/headers and pull-driven Uint8Array chunks over the port. The receiving ReadableStream requests one chunk per pull, without transferring a stream or buffering the whole response. Abort messages reach an AbortController inside the worker. Background completion is reported separately from the response and participates in runtime.drain(). Ports and abort listeners are released after body termination and background completion. Worker startup failure is retained and rejects current/subsequent requests. Abort after headers errors the receiving body; source cancellation failures reject reader.cancel().

The experimental page/build is separate from the normal demo. To run it in Capacitor, the test preparation command builds it and copies its generated assets into `demo/dist/`; the normal Capacitor configuration stays unchanged. No extra dependency, native code or public library API was added.

Run from `demo/` after building the root library:

```sh
npm run test:workers
npm run test:runtime
```

| Observation                                                  | workerd                                                         | Chromium / WebKit dedicated worker                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Outbound fetch after await, alongside concurrent UI requests | Passed                                                          | Passed; upstream URL is inside the UI interception boundary, yet does not recurse |
| Logical request URL and no document global                   | Passed over local HTTP                                          | Passed                                                                            |
| waitUntil response independence and completion               | Passed, with upstream response held until foreground completion | Passed; drain waits for released background requests                              |
| Incremental response body and client cancellation            | Passed with identity encoding                                   | Passed using pull-driven chunks; source cancel callback observed                  |
| Abort while handler is pending                               | Not separately measured through HTTP                            | Passed; abort reaches source controller                                           |
| Uncaught handler error                                       | Not compared at HTTP boundary                                   | Error name/message transported and caller rejects                                 |
| Missing route                                                | Local 404                                                       | Local 404                                                                         |

Browser upstream responses are controlled with Playwright context routing; requests still originate from the Dedicated Worker fetch. workerd uses a temporary Node HTTP upstream only in the test process. Neither is a live Cloudflare deployment.

Two test-transport differences were observed: the harness exposes the HTTP scheme used by its local connection, and compressed open-ended streams did not produce the expected first chunk in the initial probe. The streaming comparison therefore explicitly requests identity encoding. Cancelling the workerd client reader succeeded, but the source JavaScript cancel counter did not increment during the observation window. We do not claim identical server teardown callbacks based on that result.

**Decision:** separate globals solve the tested inbound/outbound collision. The initial transferable-stream prototype failed on iOS 26.1 with DataCloneError. Replacing stream transfer with a single pull-driven MessagePort chunk protocol passes the native cases on iOS 26.1, iOS 27.0 and Android 16. There is no OS-specific fallback or added native code. The framework follow-up below validates standard Hono/Express cases. Keep the bridge experimental until its public setup and remaining transport contract are defined.

**Prototype limits:** request bodies are fully buffered; only URL/method/headers/body are transported; env must be structured-cloneable, does not preserve object identity, and cannot carry functions; error identity/stack and cancellation reasons across the worker boundary are not preserved. Unconsumed bodies retain their calls until cancelled or disposed. No CORS bypass, cookie isolation, compatibility-date emulation or isolate resource limits are supplied. Hono/Express standard handlers are now also tested through this runtime prototype; framework-specific outbound I/O and additional Node APIs are not covered. Native results and their limits are recorded below.

## Validation boundary

Root Vitest checks runtime behavior. Demo Vitest checks the real Hono/Workers Express entries in local workerd. Chromium/WebKit tests check both framework contracts offline plus browser FormData, base URI, HEAD and immediate cancellation using the built library. The separate experiment has nine transport tests plus two framework suites in each browser, including startup failure, statusText, completed-call cleanup, abort after headers (including a null reason), and source cancellation failure. This does not establish full runtime compatibility. Native results cover the experimental transport, not a full rerun of every library API on physical devices.

## Native WebView verification

Installed and launched the bundled experimental app (no server.url) on 2026-10-16:

| Environment                                 | Result | Observation                                                                                                                                     |
| ------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS 26.1 Simulator, iPhone 17 Pro           | 6/6    | statusText/cleanup, outbound/concurrent calls/background completion, stream cancellation, pending abort, abort after headers, error/404 passed. |
| iOS 27.0 Simulator, iPhone 18 Pro           | 6/6    | The same six cases passed.                                                                                                                      |
| Android 16 emulator, WebView 134.0.6998.135 | 6/6    | The same six cases passed.                                                                                                                      |

The iOS versions above come from simctl runtime metadata (`SIMULATOR_RUNTIME_VERSION`), not the WebView user-agent string, which reported iPhone OS 18_7 in both tested simulators. These are observations for these environments, not a claim about the first iOS release supporting the feature. No physical device was tested.

`native.ts` runs at startup only on a native Capacitor platform. Its outbound fetches read bundled `public/api/*.txt` fixtures via Capacitor's asset handler; matching paths would otherwise re-enter the UI adapter. Exact body markers rule out a SPA fallback false positive. This measures native fetch/global separation without an API server or cloud access, not external network/CORS behavior. Native waitUntil checks completion and absence of background errors; response independence uses the held-upstream tests in Playwright/workerd, not this native fixture.

The initial transfer-based run produced 0/5 on iOS 26.1 and 5/5 on iOS 27.0/Android. Its iOS 26.1 composite failures reflected the broken body transport, not proof that AbortController was unsupported. The six-case rerun above uses MessagePort chunks on every platform, including an abort(null) after headers. The old evidence is preserved locally with the suffix `-transfer-baseline`.

Reproduce from `demo/`:

```sh
npm run test:native:prepare -- runtime
npm run sync
# Build/run the generated ios/ or android/ project with the native SDK.
# The app displays the report and logs NATIVE_EXPERIMENT with JSON results.
```

Restore ordinary demo assets with `npm run build && npm run sync`. The checked-in native config always uses `dist/`. Local ignored evidence: `demo/artifacts/native-experiment-{ios26,ios27,android}.{log,json,png}`. Screenshots were visually inspected and match the result logs.

## Hono / Workers Express follow-up

Based on main commit 41328d6, the experiment now has separate three-line Hono and Express entrypoints importing the unchanged `workers/hono/standard.ts` and `workers/express/standard.ts`. Each calls the same internal `serve` transport. The existing runtime fixture uses that transport too. No package API, dependency, Worker application logic or native implementation was changed.

The Vite experiment config installs the existing compatibility plugin at the top level (for resolution aliases) and through `worker.plugins` (for the worker build transforms). Installing it only under `worker.plugins` failed to resolve `cloudflare:node` in this build. Static worker entrypoints keep Express and its polyfills out of the Hono worker bundle. Minified, uncompressed worker artifacts measured 20.10 kB for Hono and 1,497.32 kB for Express. Express size remains a PoC limitation; this step does not optimize it.

The browser/native framework contract contains eleven named checks per framework: GET/query, JSON POST/status, route params, middleware, 404, error middleware, empty 204, HEAD, concurrency, Request input, and logical URL/framework identity. The shared contract now consumes the middleware/404 response bodies so completion can release transport resources. Tests also wait for background completion, require no background errors and check active calls return to zero before disposal.

| Environment                                 | Follow-up result                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Local workerd                               | 23 tests passed: 10 each for Hono/Express, plus 3 runtime tests                             |
| Chromium + WebKit                           | 22 Playwright tests passed: 18 transport tests and 4 framework suites (11 checks per suite) |
| iOS 26.1 Simulator, iPhone 17 Pro           | 28/28: Hono 11, Express 11, transport 6                                                     |
| Android 16 emulator, WebView 134.0.6998.135 | 28/28: the same checks                                                                      |
| Ordinary demo, Chromium + WebKit            | 4 regression tests passed                                                                   |

Browser framework suites load their Dedicated Worker, disable networking, then execute all eleven checks and assert no API network request occurred. Native runs use bundled assets and no API server, with the same transport fixture limits described above. The workerd harness compares the common nine API cases plus preserved URL path/query; Request-object input is a browser/native adapter check. The harness chooses its local connection origin, whereas browser/native requests must retain the configured logical origin.

iOS 26.0, physical devices and framework suites on iOS 27 were not tested in this follow-up. The earlier iOS 27 transport result remains historical evidence, not a framework result. Runtime-level outbound fetch/waitUntil behavior is covered by the existing neutral fixture; no new framework-specific outbound routes were added.

Run `npm run test:workers` and `npm run test:runtime` in demo. The native reproduction commands above now run all 28 checks. Follow-up logs, JSON and visually inspected screenshots are saved locally under `demo/artifacts/native-framework-{ios26,android}.{log,json,png}`. Ordinary demo assets/config were restored after validation.

**Next boundary:** this establishes that the tested unchanged framework handlers execute through the shared isolated transport. Promoting that transport to the library and designing minimal build/setup configuration remain separate work. Native binding bridges, upload streaming and broader Workers compatibility remain out of scope.

## Library integration

Historical note: the query import described here has since been removed; current setup uses build configuration or standard Worker construction. Based on main 1cd7695, the shared transport now lives in `src/browser/isolated/`. At that revision, the demo imported existing Worker files through a query-based import and passed them to the public runtime API. The six demo bridge/protocol/transport/entry files were removed. No native code or dependencies were added, and the original framework handlers are unchanged.

The Vite plugin resolves each query import into a factory and generates its worker-side entry in memory. Registered generated IDs only are transformed; ordinary files sharing the internal suffix are left untouched, and an existing file at a generated path produces an explicit build error. The plugin composes its worker build plugins with any supplied worker plugins. This uses Vite's [worker imports](https://vite.dev/guide/features.html#web-workers) and [worker plugin configuration](https://vite.dev/config/worker-options); Vite 7.3.7 is the version exercised here. No extra wrapper file, manual worker plugin setup, runtime module path string or native plugin is required.

In dev, Express's optimized dependency and an unoptimized cloudflare:node initially used separate copies of the HTTP handler registry. Including cloudflare:node in dependency optimization keeps them in the same prebundled graph. The dev suite tolerates only Vite navigation interruptions caused by dependency discovery; Worker/application errors still fail. Worker source edits use Vite's normal reload behavior; preserving in-memory Worker state across edits is not promised.

The public runtime accepts either the generated Worker factory (isolated mode) or the existing fetch handler object (direct mode). It installs fetch synchronously. Local calls wait for Worker startup, while `runtime.ready` exposes startup failure/success explicitly. Awaiting the installation function itself does not wait for startup. Invalid configuration is checked before creating a Worker. Disposal restores fetch and terminates the worker; unfinished body reads/calls reject and tracked background waits settle. Direct mode retains its shared-global limitation.

The library rejects unusable or status-0 Responses before transfer and catches reconstruction errors so callers cannot hang. The transport still buffers uploads and clones env per request; it does not preserve object identity/functions, custom abort/cancel reasons in the worker, error identity/stacks, cookie state or workerd isolation guarantees. Abort after headers is supported by isolated mode, not retroactively guaranteed for direct handlers. `drain` waits for background completion, not unconsumed bodies.

Internal lifecycle counts are not a public API. Real MessageChannel unit tests cover body/background completion, repeated-call release, crash/disposal paths, invalid Responses, malformed response metadata and non-cloneable env. The browser/native suites now use the public API and no longer inspect the old demo active-call counter.

| Check                                      | Result                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Library typecheck/build and unit tests     | Passed; 30 tests                                                                                       |
| Demo typecheck                             | Passed                                                                                                 |
| Packed npm consumer                        | Direct 26/26, isolated 22/22; public query-import types checked, no source aliases or copied transport |
| Chromium/WebKit production isolated suites | 22 tests passed                                                                                        |
| Chromium/WebKit Vite dev framework suites  | 4 tests passed                                                                                         |
| Ordinary demo browser regression           | 4 tests passed                                                                                         |
| Local workerd                              | 23 tests passed                                                                                        |
| iOS 26.1 Simulator                         | 28/28 through the library: Hono 11, Express 11, transport 6                                            |
| Android 16 emulator / WebView 134          | 28/28 through the library                                                                              |

Native evidence is in local ignored `demo/artifacts/native-library-{ios26,android}.{log,json,png}`; screenshots and JSON were inspected. Normal demo assets/config were restored. Native outbound testing still uses bundled fixtures, not external network/CORS; physical devices, iOS 26.0 and a new iOS 27 run were not tested. Public-package integration is established for these cases, not complete Workers compatibility. No npm publication or cloud deployment was performed.

The next step is a small native binding bridge and a first KV contract, with upload streaming and wider API compatibility kept separate.

### PR review corrections

Calls are registered before startup and upload buffering, so disposal or worker failure also rejects calls that have not yet been sent. A paused upload is read through a cancellable reader; stopping the call cancels that reader without waiting for the source's cancel promise, settles background tracking and closes unsent ports. Regression tests cover disposal, worker failure and abort during a paused upload, as well as disposal during startup.

A callable object with a fetch method retains the direct-handler contract. Only functions without that method are treated as Worker factories. This preserves compatibility with existing callable handlers. Earlier shared-fetch statements above are explicitly historical/direct-mode limitations.

After these corrections, 30 unit tests, 22 isolated browser tests, 4 direct browser tests and the packed consumer (26 direct / 22 isolated checks) passed. The existing native suites passed 28/28 again on iOS 26.1 and Android 16; local evidence is saved as `demo/artifacts/native-review-{ios26,android}.{log,json,png}`. The new paused-upload regressions are unit tests, not additional native cases.
