# Void React Pages

[Void](https://void.cloud/) builds full-stack applications into a Cloudflare Worker and client assets. The integration below targets **Void / @void/react 1.1.12, React Pages and D1**, using bundled client assets and the existing remote Worker. Explicit route permissions can also distribute eligible public GET handlers to the device.

## Take your Void app to mobile

Keep building your application with Void, and add an iOS and Android version for your users. This guide connects the Worker and client assets Void already generates to the mobile build.

If this is your first mobile app, start with the [Capacitor setup](integration.md#2-install-capacitor-and-this-package), then use the Void build configuration below in its separate mobile build. Already have a native app? Follow the [iOS or Android embedding guide](native-embedding.md) and select that host's runtime entry with the same build configuration.

The acceptance evidence below covers the Capacitor integration; embedding Void in an existing native app still requires verification of your application's flows.

## Build and connect

Build the existing Void application normally first, using Node **24.21.0 or newer**. Keep its `voidPlugin()` and `voidReact()` configuration unchanged. Void emits `dist/ssr/index.js`, `dist/ssr/wrangler.json` and `dist/client/`.

In the separate Capacitor Vite 7 configuration, use those generated files. Keep Void's own Vite configuration and version unchanged:

```ts
import { defineConfig } from "vite";
import { workersCapacitorPlugin } from "cf-workers-native/tooling/vite";

export default defineConfig({
  publicDir: "../dist/client",
  plugins: [
    workersCapacitorPlugin({
      worker: "../dist/ssr/index.js",
      workerConfig: "../dist/ssr/wrangler.json",
      assetsExecution: "remote",
    }),
  ],
  build: { outDir: "../www", emptyOutDir: true },
});
```

These paths assume the Capacitor build root is an application subdirectory such as `capacitor/`. Keep its output separate from Void's `dist/`. The generated configuration supplies D1 and ASSETS bindings; no parsing of `void.config.ts` or manual duplication of binding names is required. Use the Capacitor build's `workers-capacitor-server.json` report to check that the execution mode is `worker`.

The Capacitor entry uses the ordinary public API:

```ts
import { workersCapacitor } from "cf-workers-native/capacitor";

const runtime = workersCapacitor({
  baseURL: "https://worker.invalid/",
  remote: { origin: "https://your-deployed-worker.example" },
  render: "/",
});
await runtime.ready;
```

The existing Worker handles page requests, loaders and actions. D1 access stays there. `publicDir` copies the generated client assets into the native app; the document host serves those exact paths locally, so hydration and client interactions use bundled JavaScript and CSS. `assetsExecution: "remote"` keeps the Worker ASSETS binding remote; it does not prevent serving bundled files. The report’s `mode: "worker"` describes server execution, not asset delivery. The library's document host displays the response as a document; see the [integration guide](integration.md) for Capacitor installation, authentication and document rendering. The native test uses this same configuration.

## Public GET route execution

The build plugins recognize the generated output of exactly Void 1.1.12 when `execution` contains explicit GET route permissions. It can isolate static public HTTP handlers and React Pages without server dependencies. D1-backed routes, mutations, requests with Cookie or Authorization headers, dynamic paths and framework-internal paths remain remote. Custom middleware, layouts and head configuration prevent this optimization. Unknown route registrations are rejected instead of dropping their middleware.

Add permissions to the Capacitor build plugin, for example `execution: [{ method: "GET", path: "/about" }, { method: "GET", path: "/api/hello" }]`. Check `workers-capacitor-server.json`: `mode: "routes"` and each route's `remote` flag explain the result. A permission authorizes distributing the selected handler and its retained fixed data; it does not establish that the data is public. Use the deployed HTTPS Worker URL as `baseURL` for all other requests; an explicit `remote.origin` can override that destination.

The browser acceptance test checks Vite and esbuild in Chromium and WebKit, including public SSR/API execution, remote selection and exclusion of database code from JavaScript and source maps. After building the library, reproduce it with `npm --prefix demo run test:void:routes`. Native acceptance uses Vite on an iOS 26.1 simulator and Android API 36.1 emulator. It checks local public SSR, a hydrated React state update, local API access, authenticated remote selection, D1 form insertion with a database assertion, and navigation to a client-only page. Run the platforms serially:

```sh
VOID_ROUTES=1 UPSTREAM_PLATFORM=ios UPSTREAM_DEVICE=<simulator-UUID> node --test demo/tests/void/native.test.mjs
VOID_ROUTES=1 UPSTREAM_PLATFORM=android UPSTREAM_DEVICE=<emulator-serial> node --test demo/tests/void/native.test.mjs
```

This is a generated-route profile, not general local Void runtime compatibility. Unrecognized generators and unsupported routing configurations retain the remote Worker boundary.

## SSR and client-only pages

`export const ssr = false` suppresses the page component's server-rendered HTML. It does **not** make a D1-backed loader safe to execute on the device. Keep that request remote: Void obtains loader data on the Worker and the browser renders the component. Ordinary SSR pages receive initial HTML and hydrate with Void's client assets. Neither case requires converting the existing application to an SPA or replacing its forms with custom API calls.

## Verification boundary

The [standalone sample](../demo/void/README.md) and its tests cover the generated Worker in local workerd with D1, the Capacitor remote build and fetch transport, initial SSR HTML, React hydration and a form action with a database assertion in Chromium and WebKit. A client-only page reuses the same D1 loader and is absent from initial HTML but appears after client rendering. Tests also check that server schema and SQL are absent from the device build. Client components are intentionally included.

The browser test substitutes network delivery with local workerd. The native test (`demo/tests/void/native.test.mjs`) uses HTTPS and the public document API to exercise D1-backed SSR, hydration, form insertion with a database assertion, and client-only rendering in an iOS 26.1 simulator and Android API 36 emulator.

Use **1.1.12 or newer** for Capacitor iOS navigation. [Void 1.1.12](https://github.com/voidzero-dev/void/releases/tag/v1.1.12) includes our [upstream Capacitor navigation fix](https://github.com/voidzero-dev/void/pull/485). The tests use the published 1.1.12 packages without patching the router or changing Capacitor’s default `capacitor://localhost` origin. Versions before 1.1.12 reject that scheme; an initial HTML response alone does not establish working navigation.

Void-specific physical-device acceptance, deployed Cloudflare integration, production authentication, native plugin events, Vue, Svelte, Solid, other Void bindings and whole-Worker local execution are unverified.

Build the Worker and Capacitor assets from the same application build. Deploying different client/server versions independently can break hydration or actions; an older installed app must remain compatible with your deployed Worker. Paths absent from the bundle still go to the Worker.

Only bundle public files that can bypass Worker authentication, middleware and response-header rules. Capacitor does not apply Cloudflare `_headers` or `_redirects` to bundled assets. Vite also does not honor the `.assetsignore` generated by Void: listing `.dev.vars` or `wrangler.json` there does not exclude them from the native bundle. Inspect `dist/client` before copying it. If it contains files excluded from Cloudflare delivery, stage only the intended public assets in a separate directory and use that as `publicDir`. Do not include private data, server output, `_headers` or `_redirects` in the copied files. Prerendered HTML is not automatically selected for local rendering. This configuration still requires a connection for initial pages and D1 operations; it is not offline SSR.

Authentication and authorization remain application responsibilities. The sample has no authentication and must not be deployed as a production data endpoint. Server-code removal is not a general secret detector; never embed credentials in client pages, public variables or Capacitor configuration.
