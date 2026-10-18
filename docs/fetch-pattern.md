# Fetch execution pattern

Fetch execution uses a single template, `FetchRuntime<Env>`. `DirectFetchRuntime` and `IsolatedFetchRuntime` extend it; only their execution and resource cleanup differ. This is independent of env binding adapters and adds no native dependency.

## Responsibilities

| Layer                         | Owns                                                                                                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/fetch/runtime.ts`        | URL boundary and app-origin mapping, Request construction, pre-dispatch/ongoing abort, per-call context, waitUntil/drain, Response validation and HEAD normalization |
| `src/fetch/worker-runtime.ts` | Calling the handler directly or through the isolated bridge; isolated startup readiness and termination                                                              |
| `src/isolated/`               | MessageChannel serialization, upload/response transport, body cancellation and Worker-side lifetime                                                                  |
| `src/index.ts`                | Selecting the existing execution mode, single global installation and restoring the original fetch                                                                   |

The public `workersCapacitor({ baseURL, env })` setup uses the entry configured in the Vite or esbuild plugin. Explicit `worker` options remain supported. A function with a `fetch` method is still a direct handler; only a function without that method is a Worker factory. The base class is framework-independent; Hono and Workers Express continue using the same Fetch Handler interface.

## Extension recipe

Implement `dispatch` with a standard Request, env and WorkerContext. Do not duplicate routing, cancellation races or response normalization in the subclass.

```ts
import {
  FetchRuntime,
  type FetchRuntimeOptions,
  type WorkerContext,
  type WorkerHandler,
} from "@rdlabo/workers-capacitor";

class ExampleRuntime<Env> extends FetchRuntime<Env> {
  constructor(
    options: FetchRuntimeOptions<Env>,
    private readonly handler: WorkerHandler<Env>,
  ) {
    super(options);
  }

  protected dispatch(request: Request, env: Env, ctx: WorkerContext) {
    return this.handler.fetch(request, env, ctx);
  }
}
```

Constructing a runtime does not patch global fetch. Its bound `runtime.fetch` can be passed to a contract test or called directly. It captures the original network fetch and app origin at construction, as the existing installer did. `document.baseURI` is resolved per request. Existing application code should continue using `workersCapacitor`; this class is the extension point for execution implementations, not an extra application setup requirement.

If an implementation needs startup, override `ready` with its startup promise, observe rejection before the first request, and make `dispatch` wait for startup. If it owns resources, override the synchronous `close()` hook. `dispose()` calls that hook once after successful cleanup. Keep `fetch`, `drain` and `dispose` inherited. The isolated implementation demonstrates these hooks without moving its transport into the base class.

## One contract for every implementation

`tests/contracts/fetch.ts` exports `defineFetchContract(name, createRuntime)`. The factory receives a standard handler plus runtime options and returns `{ fetch, ready, drain, dispose }`. There is no requirement to patch global fetch in order to run the suite.

`tests/unit/fetch-contract.test.ts` applies exactly the same cases to:

- the installed direct runtime;
- the installed isolated runtime, using production transport over real MessageChannels;
- a minimal new subclass without global installation.

The suite covers URL/path boundaries, relative URLs and app origins, Request body/headers/overrides, abort before dispatch and while pending, HEAD source cancellation, invalid responses, unchanged network passthrough, env/context/background completion and errors without network fallback. Error name is the shared contract across execution contexts; Error object identity and synchronous cancellation callback timing are not.

Add common observable cases to this file once. Keep implementation-specific guarantees in their own tests: direct env identity and installation in `runtime.test.ts`; startup failure, crashes, upload cancellation and stream lifetime in `isolated.test.ts`. Never skip a common case for an implementation merely to get a passing result.

The simulated Worker validates the protocol, not browser engine isolation. Complete an execution change by running root unit/type/build checks, the independent demo's workerd and Chromium/WebKit suites, the fresh npm-tarball consumer, then iOS/Android WebView checks. The existing demo contracts continue to exercise unchanged Hono and Express workers across those environments. Record the actual tested versions and limits in verification documentation.

## Preserved limits

The template preserves existing behavior rather than emulating all browser networking. Direct execution shares UI globals and env identity; isolated execution clones env and owns separate globals. Isolated startup, crashes and post-header abort belong to the transport. Direct disposal does not terminate arbitrary handler work, and retained direct fetch functions retain their previous behavior after uninstallation. `drain()` tracks background work, not unconsumed response bodies. No cloud fallback, cookie/CORS emulation, additional frameworks or binding services are introduced by this refactor.

## Execution preference

`workersCapacitorPlugin({ worker: "./src/worker.ts" })` in the Vite or esbuild configuration supplies a Worker factory and a lazy direct-module loader internally. Import `workersCapacitor` from the ordinary package entry and call it with `baseURL` and optional `prefer: "worker" | "direct"` (default `worker`); no Worker import is needed. `new FetchImplementation({ baseURL, prefer })` uses the same configured entry without installing global fetch. Without a bundler, pass an explicit source with `createWorker` and `loadDirect`; see the [build setup examples](../README.md#supported-builds). `PreferredFetchRuntime` uses the existing FetchRuntime contract and transport; the feature host uses the same selection function.

Selection happens once, before dispatch. The worker preference falls back to direct if the Worker constructor is unavailable, the constructor reports platform SecurityError/NotSupportedError, or the initial env is not plain transportable data. Method-bearing bindings retain their identity in the direct environment. Accessors and custom prototypes are conservatively direct; this does not attempt to detect every Workers API or perfectly classify every structured-clone type. Direct code is not evaluated when worker execution is selected.

`runtime.ready` observes startup and `runtime.execution` reports the selected mode. Script evaluation/startup failures, request failures and env mutations after selection never trigger replay or a mode switch. Direct fallback shares UI globals and can re-enter UI fetch interception on matching subrequests. The low-level handler/factory paths remain supported; providing `prefer` to either rejects because only one candidate is available.

Direct-module loading cannot distinguish its own top-level fetch from a concurrent UI request. Matching calls during that phase reject explicitly instead of waiting on `ready`; applications must await `runtime.ready` before UI requests. Other URLs still use the original fetch. Worker-mode calls can wait for startup and abort without dispatch. Non-enumerable custom properties and null-prototype env objects select direct execution to preserve their semantics; intrinsic array length is allowed.
