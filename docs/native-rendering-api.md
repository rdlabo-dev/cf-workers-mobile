# Native document rendering through capacitorWorkers

The package includes the native connection for Capacitor 8 (verified with 8.5.3).
iOS uses Swift Package Manager; Android uses Gradle. CocoaPods is not included in
this PoC. No npm release is made by the packaging tests.

## Installation

Until a release is published, build and pack this repository:

```sh
npm ci
npm run build
npm pack
```

In a Capacitor application, install the resulting tarball, configure the Worker
in the Vite/esbuild plugin, and call `capacitorWorkers({ baseURL, render: "/" })`.
Build the web assets before synchronizing:

```sh
npm install /path/to/rdlabo-capacitor-workers-0.0.0-poc.1.tgz
npm run build
npx cap sync
npx cap run ios # or android
```

The Capacitor CLI discovers and registers the native plugin. The application
keeps its ordinary Activity/ViewController; no manual registration or copied
native sources are needed. The browser Fetch-only API remains available without
installing Capacitor.

## Application entry

```ts
import { capacitorWorkers } from "@rdlabo/capacitor-workers";

const app = capacitorWorkers({
  baseURL: "https://worker.invalid",
  render: "/",
});
await app.ready;
```

`render` is the initial local document path. Omit it to retain the existing
Fetch-only behavior. Document mode requires an HTTP(S) **origin** as `baseURL`,
without an API path prefix. The Worker receives URLs under that logical origin;
the visible page retains its Capacitor local URL (`capacitor://` on default iOS,
`https://` on default Android). No remote fallback or local HTTP server is used.

Hono and Workers Express use the same `worker.fetch(request, env, ctx)` boundary.
Their application routers return complete HTML for pages and JSON for APIs. The
adapter does not add an application router. Existing `worker`, `env`, `prefer`,
`drain()` and background-error handling continue to apply to the runtime host.

`ready` means that the Worker and native connection are initialized. It does not
mean all images or page scripts have finished loading. `await app.dispose()`
releases the document connection and runtime. Fetch-only disposal remains synchronous except while Android is clearing a
previous document registration. Document startup errors restore the original fetch
implementation; Fetch-only Worker startup errors continue to reject local requests
until explicit disposal.

## iOS Safe Area

Worker document WebViews default to `automatic` content insets when
`ios.contentInset` is omitted. An explicit value in `capacitor.config.ts` or
`capacitor.config.json` takes precedence, using Capacitor's existing options:
`automatic`, `scrollableAxes`, `never`, or `always`.

For an application that handles Safe Area in CSS and needs edge-to-edge content:

```ts
const config: CapacitorConfig = {
  // Other Capacitor settings...
  ios: { contentInset: "never" },
};
```

Run `npx cap sync ios` after changing this setting. This default applies to the
native Worker document view; the ordinary Fetch-only WebView retains Capacitor's
normal behavior. No new `capacitorWorkers` option is required.

## Build configuration

The existing Vite or esbuild plugin automatically prepares document assets:

```ts
capacitorWorkersPlugin({
  worker: "./workers/hono.tsx", // Or the Workers Express entry.
});
```

Only `render` selects document rendering at runtime; it is unrelated to whether
the application uses `form[action]`. Builds include the small internal assets
even for Fetch-only applications, but do not register a Service Worker or start
native document rendering unless `render` is set.

For native rendering, use Vite with `base: '/'` and build before Capacitor
copy/sync. The Vite dev server remains available for Fetch-only development;
native document rendering requires bundled assets. esbuild writes the assets
next to its `outfile` or into `outdir` (in-memory `write: false` builds do not
prepare native document assets). Place any separately copied static files in
the output directory before building so they appear in the asset manifest.

The generated `capacitor-workers-assets.json` identifies bundled assets, which
bypass the Worker router. All other local paths reach the Worker. Android uses
`capacitor-workers-sw.js` for browser-native Request/Response and redirect
handling. These filenames are implementation assets, not application imports.
A raw-ESM setup must supply the equivalent SW file and asset manifest itself;
the automated asset integration currently covers Vite and esbuild.

## Native implementation

- iOS keeps the ordinary application controller. The plugin retains its existing
  WebView as the runtime host and adds an internal document controller. Its scheme
  handler is registered before the document WebView is created. The host invokes
  the same Fetch Handler through the library's existing Worker transport.
- Android keeps the ordinary Activity and visible WebView. The plugin creates a
  persistent host, using the bundled bootstrap's internal host mode. A Service
  Worker forwards requests to that host and serves responses through normal
  browser navigation. The bootstrap executes again in the host, so application
  startup side effects should not be placed after or alongside runtime startup.
- The package's native sources live under `native/`. `Package.swift` and the
  Android library project are included in the npm tarball. Measurement/report
  hooks live under `demo/tests/`; they are not in the native implementation.

No application Activity/ViewController replacement, iframe, Turbo, or HTML DOM
replacement is required. The two-WebView lifecycle is internal to the adapter.

## Scope and limits

This remains a PoC. Document rendering is native-only; ordinary browser/Electron/
Tauri document startup is not implemented. Existing browser Fetch-only behavior
is unchanged. Response bodies are pulled in bounded chunks; document uploads
remain buffered with an 8 MiB limit. HTTP caching is disabled for
Worker responses. External redirects are rejected. On iOS, the page-side Fetch
bridge models redirect metadata with JavaScript properties rather than browser
internal Response slots. The iOS multipart form supplement covers same-window
local POST submissions; named windows and iframe targets are not supported.

The native host/child lifecycle, pending-request timeouts and explicit disposal
are implemented. App process termination/relaunch, background/foreground,
asset-update reinstalls without data deletion, and shutdown followed by
reinitialization are covered by the packaged acceptance below. Physical
devices, WebView crash recovery, memory pressure and arbitrary third-party
plugin lifecycle behavior are not covered by the simulator/emulator results.

## Demo and validation

[demo/rendering](../demo/rendering) contains readable Hono/TSX and Workers Express
examples: root HTML, links, POST followed by a 303 redirect, and a JSON endpoint.
The normal Fetch-only demo remains separate.

`tests/unit/documents.test.ts` exercises the public entry, startup errors,
restoration, disposal and routing. Service Worker tests cover POST bytes,
redirect mapping and asset manifest changes after an update. Both Vite and
esbuild build the public entry in `demo/tests/build/documents.test.ts`.

The packaged native acceptance fixture at `demo/tests/fixtures/apps/packaged-native`
calls the same public API. A test-only Worker wrapper adds the browser test driver
to returned HTML. It is installed from a real tarball into an independent consumer,
then uses ordinary `cap add`/`cap sync`. No native code or registration is patched.
See `demo/tests/README.md` for reproduction commands.

### Packaged installation results

Verified on 2026-10-17 with Capacitor 8.5.3 (the 50-case suite also passed on
2026-10-16 before the lifecycle stages were added):

| Target                       | Hono                               | Workers Express                    |
| ---------------------------- | ---------------------------------- | ---------------------------------- |
| iOS 26.1 Simulator (SPM)     | 50/50 + lifecycle + public dispose | 50/50 + lifecycle + public dispose |
| Android 16 emulator (Gradle) | 50/50 + lifecycle + native stop    | 50/50 + lifecycle + native stop    |

These checks cover HTML, scripts/assets, local API calls, fresh documents,
navigation/history, GET/POST forms, local redirects, multipart files and a native
CapacitorCookies call after navigation. Each run then covers: rendering and API
after background/foreground; fresh rendering and API after app
termination/relaunch; updated Worker code and bundled static assets after an
update install that preserves application data (on Android this exercises the
persistent document Service Worker); and shutdown followed by reinitialization.
iOS disposal and reinitialization use the public API from the retained runtime
host. Android stop is invoked from the visible page and reinitialization goes
through the Service Worker bootstrap path; the two are distinct and not claimed
equivalent. The Android reinit stage repeats the Fetch-only migration,
registration cleanup and current-client asset fallback assertions.

CI verifies the tarball contents and automatic plugin discovery using a fresh
consumer. Native compilation and simulator/emulator execution are local acceptance
runs, not CI results. Reports and build/console logs are under the independent
consumer's `artifacts/` directory outside the repository.

The earlier source-integration probes included 15 extra iOS metadata/diagnostic
checks requiring native script injection. Those results remain recorded in
[the investigation](document-rendering.md); they are not counted as packaged
installation checks.

### Shutdown and trust boundary

Android shutdown and failed startup disable and unregister only this library's
Service Worker. Fetch-only startup also clears an earlier document registration;
await `ready` before using the application. Already controlled pages switch to
native request handling without waiting for navigation. The disabled state is
persisted across Service Worker idle termination. Older transports without the
shutdown protocol require a reload after unregistration. Android Fetch-only
`dispose()` can return a promise while this migration is pending.

An existing application Service Worker at the root scope is not overwritten.
Document rendering reports a conflict instead. Other application registrations
are not removed during cleanup.

The bundled Worker and the HTML it produces are trusted application code. Pages
run at the Capacitor local origin and can access the application's native plugins,
just like bundled HTML. Rendering is not a sandbox for untrusted HTML; applications
must escape untrusted values and must not render arbitrary remote HTML as trusted
application pages. This trust model applies to both iOS and Android.

Library tests 132/132 and the existing Fetch-only/browser and package suites
remain regression checks. See the repository test scripts for their scope.
