# OpenNext + D1

A standalone Next.js application. `app/` contains the application and
`capacitor/` contains the native entry and Vite configuration. Test drivers live
outside the application, in [`../tests/opennext`](../tests/opennext).

## Build

From the repository root, build the library first:

```sh
npm install
npm run build
cd demo/opennext
npm install
npm run build:worker
VITE_WORKER_ORIGIN=https://your-worker.example.com npm run build:capacitor
npx cap add ios
npx cap sync ios
npx cap open ios
```

Use `android` in place of `ios` for Android. Configure a real D1 database and
apply `migrations/` before deploying the Worker. The checked-in database ID is a
placeholder for local tests.

## Execution

The normal Capacitor build reads `wrangler.jsonc`. Because this application uses
D1 and asset-first routing, **the whole request executes on the remote Worker**.
Next.js server code, SQL and credentials are not shipped in the native bundle.
The build report is `www/workers-capacitor-server.json`.

`capacitor/main.ts` sets the deployed HTTPS origin and renders `/`. Next.js owns
the HTML, navigation and client hydration. The small `capacitor/index.html` only
starts the runtime.

## Rendering examples

The home page combines initial HTML and a hydrated counter with a `next/dynamic` component using `ssr: false`. That component loads its message through `/api/message`. `/details?q=...` renders request-dependent content; `/about` is prerendered at build time. The tests distinguish these behaviors using document elements before scripts execute, client results afterwards, and the Next.js prerender manifest. They do not use the presence of a string in serialized page data as evidence of SSR.

## Authentication

The example uses the fixed credentials `alice` / `demo` solely to exercise
HttpOnly, Secure, SameSite cookies and D1-backed sessions. It is not a deployable
authentication system. POST handlers validate a random CSRF token against a Secure, HttpOnly,
`__Host-` cookie; login, note
updates and logout use ordinary HTML forms with 303 redirects.

## Tests

From `demo/`, after building this application:

```sh
npm run test:opennext
OPENNEXT_PLATFORM=ios OPENNEXT_DEVICE=<simulator-id> node --test tests/opennext/native.test.mjs
OPENNEXT_PLATFORM=android OPENNEXT_DEVICE=<emulator-id> node --test tests/opennext/native.test.mjs
```

The native remote scenario also checks calls, native events and rejected calls from a test-only Capacitor plugin before and after navigation and process restart. The plugin and driver live under `../tests/`; they are not application dependencies.

The browser integration uses workerd, a disposable D1 database and a local HTTPS
endpoint. No Cloudflare account or deployed service is required. Native tests
install the example app and trust a temporary test CA (Android trusts it only in
the debug build). Native artifacts are written under `demo/artifacts/`. Reports include the web
bundle size and elapsed time from launching the app to a hydrated counter; these
are simulator/emulator observations, not physical-device benchmarks.

The separate local profile runs only public pages without cloud bindings. It is
not a production configuration for this D1 application. Set `OPENNEXT_LOCAL=1`
on a native test command to exercise that profile's rendering and navigation.

## Limits

- Native form navigation does not supply an HTTP `Origin` header. Applications
  relying only on that header must adapt their CSRF protection; the runtime does
  not invent an Origin. This sample uses tokens on both Web and Capacitor.

- Images use `next/image` with `unoptimized: true`; `/_next/image` optimization
  is not covered.
- Incremental cache, tag cache and queue use OpenNext's dummy adapters.
- Server Actions, streaming Suspense and arbitrary third-party Next.js plugins
  are outside this sample's coverage.
- A successful remote test does not establish local OpenNext compatibility.
