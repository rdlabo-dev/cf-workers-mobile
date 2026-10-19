# Upstream OpenNext acceptance

This fixture fetches the official OpenNext App Router test application at the commit in `upstream.json`. It is an upstream test application, not a third-party production application. Application source, middleware and Next/OpenNext configuration remain unchanged. Preparation resolves monorepo dependency placeholders into an independent npm installation and verifies source files byte-for-byte after building.

## Browser baseline

From the repository root:

```sh
npm install
npm run build
npm install --prefix demo
npx playwright install chromium webkit
npm run test:upstream:opennext:prepare --prefix demo
npm run test:upstream:opennext --prefix demo
```

CI runs these checks in a separate compatibility matrix job. Preparation needs network access to GitHub, npm and the upstream application's Google Fonts dependency. Generated sources, dependencies and reports live in `demo/artifacts/upstream/opennext/`.

The Chromium/WebKit baseline verifies a hydrated Server Action, a form Server Action with a redirect and query parameters, and the `/ssr` loading fallback followed by its delayed rendered result. The server must receive the fallback observation before the SSR response ends, so a buffered final document cannot satisfy the streaming assertion. It exercises the original Worker through local Wrangler. It does not exercise the Capacitor adapter.

## Native acceptance

The native test builds the generated upstream Worker with the public plugin and `assetsExecution: "remote"`, then starts it with `workersCapacitor({ baseURL, remote, render })`. Server rendering and Server Actions execute on the Worker; returned HTML, hydration and subsequent navigation execute in the native WebView. This does not establish local Server Action or local OpenNext cache support.

It reuses the platform shell in `demo/opennext`, replacing its ignored `www` build with the upstream application entry. Run native tests serially, separately from other tests using that shell. Install Xcode/Android SDK and boot a simulator/emulator first:

```sh
npm install --prefix demo/opennext
UPSTREAM_PLATFORM=ios UPSTREAM_DEVICE=<simulator-udid> npm run test:upstream:opennext:native --prefix demo
UPSTREAM_PLATFORM=android UPSTREAM_DEVICE=emulator-5554 npm run test:upstream:opennext:native --prefix demo
```

The harness creates missing native projects, trusts a temporary test CA in the iOS simulator or Android debug build, and checks the same action/redirect/streaming flow plus the Capacitor platform. Reports and build errors are saved under `demo/artifacts/upstream/opennext/native/`. `elapsedFlowMs` measures the complete scripted flow, not startup performance. Simulator/emulator runs do not establish physical-device startup time or memory usage.

## Test boundary

A streaming HTTPS proxy inserts a test driver into the HTML without modifying upstream source. It requests identity encoding to make incremental delivery observable, and translates only its own Origin to Wrangler's local listener because Wrangler rewrites Host. Foreign origins remain unchanged. Production deployment, compressed-stream timing and OAuth redirects are not covered by this harness.

Image optimization, external-browser authentication and arbitrary real-world applications remain outside this fixture's acceptance scope.
