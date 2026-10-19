# Void React Pages

[Void](https://void.cloud/) builds full-stack applications into a Cloudflare Worker and client assets. The integration below targets **Void / @void/react 1.1.11, React Pages and D1**, using the existing remote Worker. Android native acceptance covers this configuration. iOS currently has the router limitation below; local Void runtime compatibility is not established.

## Build and connect

Build the existing Void application normally first, using Node **24.21.0 or newer**. Keep its `voidPlugin()` and `voidReact()` configuration unchanged. Void emits `dist/ssr/index.js`, `dist/ssr/wrangler.json` and `dist/client/`.

In the separate Capacitor Vite configuration, use those generated files:

```ts
workersCapacitorPlugin({
  worker: "../dist/ssr/index.js",
  workerConfig: "../dist/ssr/wrangler.json",
  assetsExecution: "remote",
});
```

These paths assume the Capacitor build root is an application subdirectory such as `capacitor/`. Keep its output separate from Void's `dist/`. The generated configuration supplies D1 and ASSETS bindings; no parsing of `void.config.ts` or manual duplication of binding names is required. Use the Capacitor build's `workers-capacitor-server.json` report to check that the execution mode is `worker`.

The Capacitor entry uses the ordinary public API:

```ts
import { workersCapacitor } from "@rdlabo/workers-capacitor";

const runtime = workersCapacitor({
  baseURL: "https://worker.invalid/",
  remote: { origin: "https://your-deployed-worker.example" },
  render: "/",
});
await runtime.ready;
```

The existing Worker handles page requests, loaders, actions and assets remotely. D1 access stays there. The library's document host displays the response as a document; see the [integration guide](integration.md) for Capacitor installation, authentication and document rendering. The native test uses this same configuration.

## SSR and client-only pages

`export const ssr = false` suppresses the page component's server-rendered HTML. It does **not** make a D1-backed loader safe to execute on the device. Keep that request remote: Void obtains loader data on the Worker and the browser renders the component. Ordinary SSR pages receive initial HTML and hydrate with Void's client assets. Neither case requires converting the existing application to an SPA or replacing its forms with custom API calls.

## Verification boundary

The [standalone sample](../demo/void/README.md) and its tests cover the generated Worker in local workerd with D1, the Capacitor remote build and fetch transport, initial SSR HTML, React hydration and a form action with a database assertion in Chromium and WebKit. A client-only page reuses the same D1 loader and is absent from initial HTML but appears after client rendering. Tests also check that server schema/application code is absent from the device build.

The browser test substitutes network delivery with local workerd. The native test (`demo/tests/void/native.test.mjs`) uses HTTPS and the public document API to exercise D1-backed SSR, hydration, form insertion with a database assertion, and client-only rendering on Android.

**iOS limitation:** Void 1.1.11 rejects `capacitor:` URLs in its client router (`Void Router: refusing to navigate to a capacitor: URL.`). Initial server HTML can arrive, but form/router navigation fails. Capacitor iOS uses a custom scheme; changing its name does not make it HTTP(S). [`server.iosScheme`](https://capacitorjs.com/docs/config) cannot use `http` or `https`, which WKWebView already handles. Do not claim native iOS support, override `URL.protocol`, or remove Void's URL security check to hide this incompatibility. Upstream support for same-origin native schemes is needed.

Deployment, production authentication, native plugin events, Vue, Svelte, Solid, other Void bindings and local execution are unverified.

Authentication and authorization remain application responsibilities. The sample has no authentication and must not be deployed as a production data endpoint. Server-code removal is not a general secret detector; never embed credentials in client pages, public variables or Capacitor configuration.
