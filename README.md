# @rdlabo/workers-capacitor

Small, experimental PoC: run a Cloudflare Workers fetch handler in a Capacitor WebView. Local requests execute without an API server or socket listener. D1- and Hyperdrive-backed requests can reuse the existing deployed Worker through the build integration below. This executes JavaScript in the WebView; it does not compile Workers code to native code.

## Contents

- [Quick start](#quick-start)
- [Native HTML rendering](#native-html-rendering)
- [Build setup](#build-setup)
- [Runtime behavior](#runtime-behavior)
- [Workers Express](#workers-express)
- [Local KV](#local-kv)
- [D1 and remote APIs](#d1-and-remote-apis)
- [Development and testing](#development-and-testing)
- [Compatibility and limitations](#compatibility-and-limitations)
- [Extending the library](#extending-the-library)
- [Roadmap](#roadmap)

## Quick start

Configure your existing Worker entry with one of the [supported build setups](#build-setup), then initialize the runtime in your application:

```ts
import { workersCapacitor } from "@rdlabo/workers-capacitor";

const runtime = workersCapacitor({
  prefer: "worker", // Default. Use "direct" to prefer the UI environment.
  baseURL: "https://api.example.com/api/",
});

// Finish initialization before UI requests (direct modules load lazily).
await runtime.ready;

// Existing UI calls stay unchanged.
const response = await fetch("/api/hello");
```

## Native HTML rendering

The source API also supports `workersCapacitor({ baseURL: "https://worker.invalid", render: "/" })`.
The existing Worker returns complete HTML and owns page/API routing. The build
plugin automatically emits the internal assets; no additional build option is needed.

Native integration is included in the package for Capacitor 8: iOS uses Swift
Package Manager and Android uses Gradle. Build the web assets and run `npx cap sync`
to register it automatically. CocoaPods integration is not included. See the [API guide](docs/native-rendering-api.md) and
[Hono/Express rendering demo](demo/rendering). Omitting `render` keeps the
Fetch-only behavior described above.

Worker-generated pages are trusted application code and run with the app's
Capacitor plugin access. Native rendering does not sandbox untrusted HTML.

## Build setup

### Supported builds

| Build              | Setup                                      | Input                                             |
| ------------------ | ------------------------------------------ | ------------------------------------------------- |
| Vite 7             | `@rdlabo/workers-capacitor/vite` plugin    | TypeScript / JavaScript, Workers Hono and Express |
| esbuild 0.28       | `@rdlabo/workers-capacitor/esbuild` plugin | TypeScript / JavaScript, Workers Hono and Express |
| Browser ES Modules | Explicit Worker source below               | Browser-compatible JavaScript only                |

Other bundlers are not currently supported. Add these plugins only to the Capacitor/browser build, never the Cloudflare build.

### Vite

Add the plugin to the Capacitor/browser Vite configuration:

```ts
import { defineConfig } from "vite";
import { workersCapacitorPlugin } from "@rdlabo/workers-capacitor/vite";

export default defineConfig({
  plugins: [workersCapacitorPlugin({ worker: "./src/worker.ts" })],
});
```

The plugin's `worker` path is relative to the Vite root (absolute paths also work). The plugin connects that entry to the normal package import; no special import or generated source file is needed in application code.

### esbuild

For esbuild, use the same application code with this build configuration:

```js
import { build } from "esbuild";
import { workersCapacitorPlugin } from "@rdlabo/workers-capacitor/esbuild";

await build({
  entryPoints: ["src/main.ts"],
  outdir: "www",
  bundle: true,
  format: "esm",
  platform: "browser",
  plugins: [workersCapacitorPlugin({ worker: "./src/worker.ts" })],
});
```

The entry path is relative to `absWorkingDir` (or the current directory). Serve the entire output directory, including emitted Worker assets and lazy direct modules. Worker compilation uses the plugin's compatibility transforms; additional application plugins are not applied to the Worker bundle. Browser ESM output with `outdir` or `outfile` is required. Worker entries must bundle into a single JavaScript file; separate CSS/file assets are not supported.

### Browser ES Modules (no bundler)

Without a bundler, copy the package's `dist` directory to your public `lib` directory and use ordinary relative ES Module imports:

```js
// main.js (loaded with <script type="module">)
import { workersCapacitor } from "./lib/index.js";

const runtime = workersCapacitor({
  baseURL: "https://api.example.com/api/",
  worker: {
    createWorker: () =>
      new Worker(new URL("./worker-entry.js", import.meta.url), {
        type: "module",
      }),
    loadDirect: async () => (await import("./worker.js")).default,
  },
});
await runtime.ready;
```

```js
// worker-entry.js
import { serve } from "./lib/worker.js";
import worker from "./worker.js";
serve(worker);
```

`worker.js` exports the existing Fetch Handler. All its dependencies must also be browser-compatible ES Modules with resolvable URLs. This path does not transform TypeScript, bare npm imports, Node APIs or `cloudflare:*` imports. The public bundled equivalent of `lib/worker.js` is `@rdlabo/workers-capacitor/worker`.

## Runtime behavior

### Execution preference

The default `prefer: "worker"` starts a Dedicated Web Worker when available and the initial `env` contains only plain data. If Worker is absent, its constructor reports SecurityError/NotSupportedError, or `env` contains methods/custom prototypes/accessors (such as local KV bindings), it selects direct execution before handling any request. `prefer: "direct"` loads the direct module without creating a Worker. Direct execution is always the available baseline; a module or application error does not mean it is unavailable.

Await `runtime.ready` and inspect `runtime.execution` (`"worker"` or `"direct"`) to observe the selection. Direct code is dynamically imported only when selected. Selection happens once: startup script failures and request errors are reported, never replayed in the other environment. This is not automatic detection of every unsupported Workers API. Changes to `env` after selection do not trigger reselection. Worker selection conservatively accepts primitives, ordinary objects and arrays (including cycles), without non-enumerable custom properties or null prototypes; other structured-clone-capable types currently select direct too.

### Initialization and cleanup

Installation synchronously intercepts fetch. Worker-mode requests wait for startup; matching requests during direct-module loading reject explicitly to prevent top-level-await deadlocks. Await `runtime.ready` before starting UI requests. The runtime cannot distinguish module-initialization calls from concurrent UI calls, so both reject while direct loading is in progress. `await runtime.ready` observes startup success/failure before rendering the UI. `await workersCapacitor(...)` does **not** await Worker startup.

Only one installation is supported; `runtime.dispose()` restores fetch and terminates the Dedicated Worker. Termination rejects unfinished local calls/body reads and releases background tracking.

### Explicit Worker sources

Explicit direct-handler imports and standard `new Worker(new URL(...), { type: "module" })` factories are supported. `prefer` requires the plugin configuration or an explicit source with both `createWorker` and `loadDirect`; it cannot manufacture a second candidate from a handler or factory alone.

Direct imports remain supported: `import worker from "./worker"` supplies an object with `fetch` and runs in the UI global scope. Hono needs no build plugin in that mode; Workers Express still needs the compatibility plugin. Worker subrequests stay outside UI interception only when `runtime.execution` is `"worker"`; direct fallback shares the UI global environment.

If the Worker or any dependency uses Workers extensions (for example
`Headers.getAll("set-cookie")` or `Request.cf`) during module evaluation, configure
`worker` in the Vite/esbuild plugin as shown above. The runtime installs its Web
APIs before loading that entry and its dependencies, in both execution modes.
With a direct static import, module evaluation happens before `workersCapacitor()`
can initialize those APIs; only calls made after initialization use the installed
implementations. For plain JavaScript, use the `loadDirect` source shown above
when initialization must precede module evaluation.

### URL contract

#### How local requests are selected

The adapter resolves the request URL, then checks both its address and path:

1. The URL must match either the running app's **protocol and host** (including the port), or the origin configured in `baseURL`.
2. Its path must equal the `baseURL` path boundary or be below it. For `/api/`, `/api` and `/api/hello` match; `/apiary` does not.

Matching requests normally run in the local Worker. With D1 build integration, the generated selector can send them to the existing deployed Worker before local execution. The adapter replaces the origin with the `baseURL` origin while preserving the path and query. The protocol alone does not select local execution: `capacitor://other-host/api/hello` does not match an app running at `capacitor://localhost`.

With default Capacitor settings, `fetch("/api/hello")` follows these paths (assuming no `<base>` override and `baseURL: "https://api.example.com/api/"`):

| Platform | Resolved app request URL          | URL received by the local Worker    |
| -------- | --------------------------------- | ----------------------------------- |
| iOS      | `capacitor://localhost/api/hello` | `https://api.example.com/api/hello` |
| Android  | `https://localhost/api/hello`     | `https://api.example.com/api/hello` |

The adapter uses the running app's URL, so custom scheme/hostname settings are handled by the same comparison. Without a generated remote boundary these are local JavaScript calls; neither row sends an HTTP request to `api.example.com`. D1-backed requests instead use the configured `remote.origin`.

#### Endpoint examples

For `baseURL: "https://api.example.com/api/"` and an app served at `https://localhost/` (without a `<base>` override):

| URL passed to `fetch()`             | Request endpoint                           | Handled by     |
| ----------------------------------- | ------------------------------------------ | -------------- |
| `/api/hello?name=A`                 | `https://api.example.com/api/hello?name=A` | Local Worker   |
| `https://api.example.com/api/hello` | `https://api.example.com/api/hello`        | Local Worker   |
| `/api`                              | `https://api.example.com/api`              | Local Worker   |
| `/apiary`                           | `https://localhost/apiary`                 | Original fetch |
| `/outside.txt`                      | `https://localhost/outside.txt`            | Original fetch |
| `https://other.example/api/hello`   | `https://other.example/api/hello`          | Original fetch |

For local execution, the endpoint is the URL received by the Worker's Fetch Handler; no HTTP request is sent to that server.

The path in `baseURL` selects a boundary; it is **not appended** to request paths. Relative paths resolve against `document.baseURI` (including `<base href>`) first, falling back to location when no document exists. Same-app URLs (including iOS `capacitor://localhost`) in the boundary are remapped to the base origin. Set a root base URL only if you intend to intercept every same-app fetch. A local 404/500 or exception never retries against the network. UI navigation, XHR, images and other WebViews are not intercepted.

## Workers Express

The sample uses the real `express` package and the Workers entry style:

```ts
import express from "express";
import { httpServerHandler } from "cloudflare:node";

const app = express();
app.use(express.json());
app.get("/api/hello", (_req, res) => res.json({ hello: "world" }));
app.listen(3000);
export default httpServerHandler({ port: 3000 });
```

Use the plugin shown above only in the Capacitor/browser build, never the Cloudflare build. It supplies Workers-compatible `node:http` and `node:net` adapters alongside browser polyfills; the [compatibility inventory](docs/node-compatibility-inventory.md) records the verified baseline and modules. `listen(3000)` registers an in-memory handler, not a listening TCP port. The plugin supports both Hono and Workers Express; framework code stays unchanged.

### TypeScript types

The package provides the `cloudflare:node` type for its supported `httpServerHandler` adapter. For a browser build without existing Workers type declarations, add it to `compilerOptions.types` in `tsconfig.json`:

```json
{ "compilerOptions": { "types": ["@rdlabo/workers-capacitor/cloudflare"] } }
```

Keep any other types your project already uses. This is a type-only entry; do not import it at runtime. Projects with generated Workers types should keep those declarations instead. No application-owned `cloudflare.d.ts` or `client.d.ts` is needed.

## Local KV

Use `LocalStorageKV` from `@rdlabo/workers-capacitor/features/kv` to supply a persistent KV binding through `env` in direct execution, including read modes, bulk reads, metadata, expiration and paginated listing. See [setup, supported operations and limits](docs/kv.md). The named contract is tested against local workerd; cloud replication and isolated binding RPC remain outside its scope.

## D1 and remote APIs

R2, Service Bindings and Queue producers use the same build-generated HTTP
dispatch. KV-only routes follow the required per-binding `kvExecution` (`local`/`remote`)
setting; requests selected for remote execution use
the deployed Worker's cloud KV. See the [service binding guide](docs/remote-service-bindings.md)
for configuration, upload limits and verification status.

Hyperdrive-backed Workers use the same generated HTTP dispatch. The plugins detect Wrangler `hyperdrive` bindings, keeping database drivers, SQL and connection credentials on the existing Worker. See [transparent Hyperdrive migration](docs/hyperdrive-transparent-migration.md) for setup, security boundaries and verification.

Reuse an existing Worker in Capacitor without rewriting its D1 operations as HTTP calls. The Vite and esbuild plugins read Wrangler's D1 binding names and remove server route implementations, including SQL, from the client build. Requests are selected before local execution and sent to the existing deployed Worker. Other routes run locally; when the build cannot safely split the application, the entire Worker runs remotely and the build reports that decision.

Configure the existing Worker entry in the plugin, then set `remote: { origin: "https://your-worker.example", getToken: () => existingSession.accessToken }` when calling `workersCapacitor`. The optional token callback connects existing bearer credentials. Native Capacitor also reuses server-managed Cookie sessions and same-origin redirects through the existing login UI; this package does not issue sessions or provide a login system. See [transparent D1 migration](docs/d1-transparent-migration.md) for setup, build reports, supported boundaries, and verification.

## Development and testing

Requires Node 22.18+ (22.x) or 24.11+, npm, and the native SDKs for native tests. Package publication, PR creation and cloud deployment are not part of these commands.

### Library and package tests

```sh
npm ci
npm run build
npm run typecheck
npm test
npx playwright install chromium
npm run test:package
```

### Demo and integration tests

Follow the [demo setup guide](demo/README.md) to see which files to configure and how to run the app.

The demo is an independent npm project under `demo/`, with its own package manifest and lockfile. Capacitor, Hono, Express, native projects and integration tests belong to that project. It consumes the built library through `file:..`; it is not an npm workspace.

The demo layout separates application sources from tooling:

```text
demo/
  src/
    main.ts         Runtime initialization and Worker HTML display
    workers/        Hono and Express application code
  tests/
    validation/     Validation page, runners, contracts and Worker entries
    fixtures/
      apps/         Runtime and build-tool test apps
      workers/      Test-only Worker handlers
    scripts/        Node.js helpers that build test apps
    ...             Automated tests and Playwright/Vitest configurations
  ios/, android/    Native projects
```

`demo/src/main.ts` initializes the runtime and displays the HTML returned by the Worker’s `/` route. Hono is selected by default; the commented Express entry in `demo/vite.config.ts` shows how to switch. Browser tests build and render the same demo with each Worker. The separate `demo/tests/validation/` page runs compatibility checks; it has its own build and is served separately by the browser tests. Application sources never import validation code. Its shared HTTP checks live in `demo/tests/validation/contracts/http.ts` and are reused by the build-tool and runtime tests.

Application Workers are organized as `demo/src/workers/<framework>/<scenario>.ts`. The Hono and Express examples each render HTML at `/` and expose `/api/hello` as JSON. This Fetch-only example inserts the returned HTML into the existing page; it is not the native document rendering path and does not provide navigation, returned-script execution, or form handling. For Worker-owned documents on iOS/Android, `demo/rendering` uses `workersCapacitor({ baseURL, render: "/" })` with the packaged native integration. Broader routing and error-handling cases live in `demo/tests/fixtures/workers/{hono,express}/standard.ts`; runtime and binding fixtures also live under `demo/tests/fixtures/workers/`.

```sh
cd demo
npm ci
npm run typecheck
npm run build
npx playwright install chromium webkit
npm run test:browser
npm run test:workers
npm run test:runtime
npm run test:runtime:dev
npm run test:build-tools
```

`npm run test:build-tools` in `demo` checks Vite and esbuild with Hono and Express, plus unbundled browser ESM, in both execution modes on Chromium and WebKit.

`test:workers` runs Vitest tests in `demo/tests/workers/` against **local workerd**, using Wrangler's `createTestHarness`. Hono and Express each have two checks for the demo Worker and ten contract-fixture checks covering the API behavior checked in the WebView. It is not a live Cloudflare deployment. To filter tests, use e.g. `npm run test:workers -- -t hono`. `test:package` installs an actual npm tarball into a fresh temporary consumer and checks package types plus both direct and isolated framework execution without handwritten aliases/polyfills.

### Local Cloudflare development

Cloudflare CLI configuration lives in `demo/cloudflare.config.ts`. From `demo/`, run `npx cf build --mode hono` or `npx cf build --mode express` to build the corresponding Worker; use `npx cf dev --mode hono` (or `express`) for local development. The installed `cf` version is currently beta. Wrangler remains a development dependency for the CLI's bundler and the test harness; tests use the same compatibility settings, checking the example Workers as well as separate contract fixtures.

### Native demo

The native build requires Xcode 26 / Swift 6.2 or newer and Java 21.
HTTP/1.1 request framing and response parsing run in JavaScript/WebAssembly.
The native plugin provides TCP/TLS byte I/O and WebView integration; iOS uses
Network.framework without AsyncHTTPClient or Swift NIO. Android uses Netty for
TCP/TLS, without its HTTP codec.
HTTPS response bodies require Content-Length or chunked framing; EOF-delimited
HTTPS bodies fail explicitly because the native byte bridge cannot distinguish
authenticated closure from truncation. See [the native boundary](docs/native-boundary-audit.md).
For Android, add the following resource rules inside `android {}` in the application's
`android/app/build.gradle` (already present in the demo):

```groovy
packaging.resources {
    excludes += 'META-INF/INDEX.LIST'
    merges += 'META-INF/io.netty.versions.properties'
}
```

These combine Netty's dependency metadata; the library does not modify the application's Gradle configuration.

Run the following from `demo/`, after building its web assets:

```sh
npm run sync
npm run ios
npm run android
```

Android requires Java 21+. The demo opens the minimal Hono example. For the separate 26-check validation app, run `npm run test:native:prepare -- validation`, then the same sync/ios/android commands. This replaces generated `dist/` assets; run `npm run build` and `npm run sync` to restore the example app. No `server.url` or development server is configured in Capacitor. Results appear in the UI and as `POC_RESULT` in the native console. Browser tests additionally re-run 18 API checks with networking disabled.

### Continuous integration

CI runs library/type checks, real local workerd contracts, Chromium/WebKit integration and a fresh npm-tarball consumer. See [CI and merge protection](docs/ci.md) for the required `CI` check and the separate native verification boundary.

## Compatibility and limitations

### Supported API behavior

- Covered: Hono and Workers Express GET/POST/HEAD, query and route params, JSON bodies, middleware, 404/500, concurrent requests, Request input, logical URLs.
- Optional `env` injects caller-provided values into the fetch handler's second argument. In isolated mode it is cloned per call: functions/native plugin objects cannot be passed and object identity is not preserved. No Wrangler secrets or bindings are imported. `cloudflare:workers` named `env` access currently throws a diagnostic; it is not the injected argument.
- `ctx.waitUntil()` tracks promises without delaying the response; `runtime.drain()` waits for them. Errors go to optional `onBackgroundError` (default: console). OS suspension/termination can stop pending work.
- Fetch abort rejects the caller and propagates a signal. It cannot forcibly stop arbitrary application work. Cookies, redirect following, `Response.url` population, credentials/cache policies and CORS enforcement are not emulated for local calls.

The [API and service support map](docs/api-support.md) separates Node.js, browser APIs, Workers-specific APIs and Cloudflare bindings, with source folders and status for each.

The [Node.js compatibility inventory](docs/node-compatibility-inventory.md) separates JS implementations, global adapters, native transports and architecture gaps. Its implementation status distinguishes completed, verified units from planned or unverified modules.

### Framework and platform limits

- Workers HTTP request/response streaming and native TCP are covered by shared contracts. File serving, WebSockets, other Node modules and async context propagation require their own compatibility work; the inventory records their status. The compatibility layer is not a general Node runtime.
- `passThroughOnException`, WorkerEntrypoint/RPC and Service Worker format are unsupported. Workers-specific Request fields are covered only where stated in the compatibility inventory; `Request.cf` is preserved locally and is not populated with Cloudflare network metadata. Worker evaluation must not fetch its own local endpoints before installation.
- CapacitorHttp's fetch patch is not tested; leave it disabled for this PoC. The package includes native TCP/TLS transport and document integration sources (iOS SPM / Android Gradle). A plain browser uses browser Fetch; native document rendering requires Capacitor.

### Security and network boundaries

- Client bundles are readable by users. Do not bundle server secrets or privileged backend logic. Unsupported operations do not automatically connect to cloud resources.

With a direct Worker import, matching Worker subrequests can re-enter the UI handler. In Capacitor, outbound HTTP(S) uses the packaged native transport, including when relayed from a Dedicated Worker. This transport handles headers, redirects and response bytes outside browser CORS enforcement. In a plain browser, outbound requests use browser Fetch and remain subject to its CORS and header restrictions. Neither execution mode is a workerd isolate.

### Worker transport and resource lifetime

The isolated transport streams uploads and responses as pull-driven MessagePort chunks (uploads are split at 64 KiB). Upload handlers can run before EOF; cancellation releases the upload reader. It preserves status/statusText/headers, body cancellation, abort after headers and background completion. Invalid/used/locked responses and status-0 opaque/error responses reject. Errors retain name/message, not identity/stack; custom abort/cancel reasons are not transported to the Worker. Unconsumed response bodies retain resources until consumed, cancelled or disposed. `drain()` tracks background work, not body consumption.

### Validation history

See [the runtime investigation and validation history](docs/runtime-contract.md). The validation app under `demo/tests/fixtures/apps/runtime/` now uses the library's public factory path; the transport is no longer copied into the demo. Its native assets are prepared using the documented test command. No npm release has been published by this change.

## Extending the library

We accept completed compatibility units only. Partial implementations remain development work and are not eligible for merge or release. See the [contribution and acceptance policy](CONTRIBUTING.md).

### Common feature standard

A typed feature definition connects implementations, coverage and contract tests across APIs, services and engine capabilities. The shared host owns initialization rollback and cleanup. See [the common feature standard](docs/feature-standard.md) for the implementation recipe and validation rules. The demo applies it to fetch, a local KV binding profile and WebAssembly validation.

### Fetch implementation pattern

Fetch implementations extend `FetchRuntime` and share one contract suite. See [the Fetch extension recipe](docs/fetch-pattern.md) for responsibilities, subclass hooks and required verification. Application setup uses `workersCapacitor({ baseURL })` with a configured build plugin, or an explicit `worker` option.

## Roadmap

1. Keep the runtime small and validate Hono/Workers Express against real WebViews.
2. Reuse existing D1-backed Workers through build-generated remote execution boundaries, preserving their HTTP contracts and removing server-only implementations from Capacitor bundles. Keep local KV independent. See the [D1 migration](docs/d1-transparent-migration.md).
3. Expand setup automation, compatibility and browser/Electron/Tauri execution. Keep Worker entry configuration and application initialization simple.

The Hono + Express compatibility test app currently includes broad Node polyfills; bundle size is a PoC finding, not an optimized release. See [verification results](docs/verification.md) for measured results and limitations.

## Execution environment and async context

The original Worker handler remains the Cloudflare entry. Install the Vite/esbuild
plugin only in the Capacitor/browser build: its aliases select the local API
implementations; the Cloudflare build retains native `node:*` and `cloudflare:*`.
`getExecutionEnvironment()` (also available from `@rdlabo/workers-capacitor/environment`)
distinguishes Cloudflare Workers, native Capacitor hosts, browser workers, browsers,
and unknown realms. A browser Dedicated Worker is not Cloudflare Workers.
Installing the Capacitor runtime in Cloudflare Workers fails before changing globals.

Capacitor builds lower async functions and generators, preserving module-level
`await`, so AsyncLocalStorage scopes restore immediately and Promise continuations
retain their own stores. Application handlers need no edits. Native async callbacks
created outside this build pipeline (for example with `eval`) are rejected as ALS
scope callbacks. Cloudflare continues to use its native async context implementation.

Document responses are fetched incrementally on iOS and Android. Native document
uploads still cross a buffered boundary and reject above 8 MiB before concatenation;
use the Fetch-only runtime for streaming uploads. LocalStorage KV stream reads decode
bounded chunks lazily, but the storage API itself necessarily returns a complete
encoded record. Its synchronous storage/quota limits still apply.

## Additional Cloudflare bindings

Durable Objects, Workers AI, Vectorize, AI Search, Workflows and other cloud
bindings are discovered for whole-request remote dispatch. `remoteBindings`
adds server-only names (including secrets and future bindings); unrecognized
binding-shaped configuration requires explicit acknowledgement. ASSETS uses an
explicit `assetsExecution: "remote"` acknowledgement and retains its cloud routing
behavior. Local ASSETS compatibility remains unimplemented. See
[Cloudflare bindings and remote ASSETS](docs/cloudflare-bindings.md) for the
configuration, supported scope and verification commands. WebSocket upgrades
remain outside the remote HTTP transport.

## License

[MIT](LICENSE).
