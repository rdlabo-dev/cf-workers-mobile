# Document connection investigation

## Acceptance boundary

The application entry remains `workersCapacitor(...)`. Hono and Workers Express
both expose `worker.fetch(request, env, ctx)`; their existing routers own HTML,
API endpoints, and redirects. The adapter must not add a second application
router. No native HTTP server, iframe, or persistent-window HTML replacement.
Users should not replace their Activity or ViewController.

Native form navigation may be excluded if necessary: applications can send POST
requests with `fetch()`. This relaxation does not waive normal document lifecycle,
links, relative URLs, or history. External redirects are out of scope.

## Plan and decision gates

1. Inspect installed Capacitor 8.5.3 initialization and public plugin hooks.
2. Use an ordinary iOS 26.1 `CAPBridgeViewController` with a test plugin to verify
   configuration mutation and navigation interception. No custom controller.
3. Test HTML loading at the requested URL, relative paths, new Window creation,
   and back history before adopting the hook for Worker responses.
4. Keep Hono and Workers Express Fetch Handler tests identical where possible.
5. Only promote a connection to the public API once its lifecycle and routing
   gates pass. Earlier custom-controller experiments are evidence of feasibility,
   not evidence that an ordinary plugin can do the same thing.

## Confirmed facts

- Capacitor constructs its WebView and registers the asset scheme handler before
  loading plugins. `CAPBridgeProtocol.webView` is read-only.
- `WKWebView.configuration` returns a copy. In the simulator, registering a new
  handler on that copy does not register it on the existing WebView.
- `shouldOverrideLoad` can allow/cancel a navigation; it cannot supply a Response
  or intercept arbitrary subresource requests.
- A plugin can call `loadHTMLString(_:baseURL:)`. The first native probe preserved
  both `location.href` and `document.baseURI` as
  `capacitor://localhost/probe/page`; relative `./next` resolved correctly.
  History/lifecycle must be measured separately; URL preservation alone is not
  acceptance of this approach.
- `document.open/write/close` keeps the same Window. In Chromium and WebKit, a
  classic script ran twice over two replacements but the same module URL ran only
  once. This approach is rejected for transparent Worker document rendering.

Sources: installed `CAPBridgeViewController.swift`, `CAPBridgeProtocol.swift`,
`WebViewDelegationHandler.swift`, and Apple's
[configuration documentation](https://developer.apple.com/documentation/webkit/wkwebview/configuration).

## Reproduction

`demo/tests/native/connection/ConnectionProbe.swift` is a test-only plugin.
`node demo/tests/scripts/native-connection-overlay.mjs apply` registers it on the
ordinary demo controller; `restore` restores the exact original SceneDelegate.
Build and launch the demo on the iOS 26.1 simulator. Read
`Documents/connection-probe.json` from the app's data container. The overlay is
never a required setup step for consumers.

The persistent-window alternative can be reproduced with
`node demo/tests/experiments/document-replacement.mjs` (Chromium and WebKit).

The existing native scheme-handler/Service Worker experiment and its Hono/Express
results are documented separately in [document-rendering.md](document-rendering.md).

## Decision: plugin-owned document view

The ordinary-plugin `loadHTMLString` experiment passed URL preservation and new
Window creation, but failed native back-history acceptance: after the second
page finished loading, `canGoBack` was false, `goBack()` did nothing, and the URL
remained `/probe/next`. This is not the selected connection.

A different arrangement preserves native document loading without asking the
application to replace its controller:

- **iOS:** the ordinary parent `CAPBridgeViewController` stays in place. A plugin
  uses its WebView as the persistent Worker host and adds a library-owned child
  controller with a new document WebView. Its scheme handler is installed before
  creation. There are two WebViews, not three: the original one is reused as the
  host. The application does not instantiate the child controller.
- **Android:** the ordinary `MainActivity` stays unchanged. A discovered plugin
  creates the runtime host; the original visible WebView uses the Service Worker
  request path already exercised by the document experiment.
- Both deliver Requests to the same Worker Fetch Handler. The application router
  chooses HTML or JSON. No Hono/Express-specific native code is introduced.

The iOS probe invokes the plugin through a JavaScript native Promise, then runs
the existing document checks. Registration is test wiring in SceneDelegate; npm
plugin auto-discovery and SPM packaging have **not** been validated by this probe.
Android uses its normal plugin discovery list, populated by the test overlay.
Neither probe is the final `workersCapacitor()` implementation.

### Results on 2026-10-16

| Check                                          | Result                                  |
| ---------------------------------------------- | --------------------------------------- |
| iOS 26.1, plugin-owned view, Hono              | 65/65                                   |
| iOS 26.1, plugin-owned view, Workers Express   | 65/65                                   |
| Android 16, discovered plugin, Hono            | 50/50                                   |
| Android 16, discovered plugin, Workers Express | 50/50                                   |
| Shared Worker tests using workerd              | 52/52                                   |
| Library unit tests                             | 103/103                                 |
| Persistent-window replacement rejection probe  | Chromium and WebKit confirmed           |
| Ordinary iOS plugin connection rejection probe | Confirmed, including history after load |

The successful native tests include fresh Windows, ordinary module execution on
revisit/reload, links, back/forward, relative assets, generated script responses,
API calls, redirects, and native Capacitor plugin calls. The existing form/file
checks also pass, so excluding forms is not required to prove this connection.
These are simulator/emulator results, not physical-device acceptance.

Artifacts: `demo/artifacts/plugin-documents-{hono,express}-ios.json`,
`plugin-documents-{hono,express}-android.json`, and `connection-probe.json`. Native
response/header/cache/body limits from the earlier experiment still apply.

### Implementation plan after connection validation

1. Move the selected connection behind a normal packaged Capacitor plugin, with
   automatic registration and no consumer Activity/ViewController modifications.
2. Keep `workersCapacitor(...)` as the single application startup API. Keep
   existing Fetch-only applications working; make document rendering an explicit
   configuration choice rather than automatically taking over their UI. Do not
   export separate application startup functions.
3. Let the Vite/esbuild adapters generate the internal host assets from the
   configured Worker entry. Plain-JavaScript builds need documented equivalent
   assets. Consumers do not author an extra application router or import virtual
   document entrypoints.
4. Add startup/error/timeout handling, repeated-start protection and cleanup for
   child controllers, script handlers, Service Workers and pending requests.
   Validate app background/foreground and memory pressure, not only navigation.
5. Test plugin discovery from an installed npm tarball on both platforms, then
   exercise Hono/Express through the actual public entry and ordinary demo.
   Update CI and public docs only for the supported integration.

The premature separate `./documents` public API and build option drafts were
removed from source during this investigation. Existing native experiments were
preserved. This investigation validates the connection architecture; it does not
claim the packaged public integration or its lifecycle work is finished.

## Public API follow-up

The public source integration is now implemented through `workersCapacitor({ render })`;
see [native-rendering-api.md](native-rendering-api.md). The remaining packaging
step is deliberately deferred. Earlier investigation results above describe the
connection probes, not the later public-entry acceptance runs.
