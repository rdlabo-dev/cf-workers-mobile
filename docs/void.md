# Void React Pages

[Void](https://void.cloud/) builds full-stack applications into a Cloudflare Worker and client assets. Use **Void / @void/react 1.1.12 or newer** for React Pages and D1 integration on iOS and Android. [Void v1.1.12](https://github.com/voidzero-dev/void/releases/tag/v1.1.12) includes the Capacitor iOS navigation fix. Page requests, loaders and actions run on the existing remote Worker; local Void runtime compatibility is not established.

The existing sample remains pinned to 1.1.11. The verification record below distinguishes that baseline and the tested patched client from the 1.1.12 release requirement.

## Build and connect

Build the existing Void application normally first, using Node **24.21.0 or newer**. Keep its `voidPlugin()` and `voidReact()` configuration unchanged. Void emits `dist/ssr/index.js`, `dist/ssr/wrangler.json` and `dist/client/`.

In the separate Capacitor Vite 7 configuration, use those generated files. Keep Void's own Vite configuration and version unchanged:

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
import { workersCapacitor } from "workers-capacitor";

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

**Version and verification:** Void 1.1.11 rejects `capacitor:` URLs in its client router, so initial HTML alone does not establish working iOS navigation. Our [upstream PR #485](https://github.com/voidzero-dev/void/pull/485) adds Capacitor navigation support and is included in [v1.1.12](https://github.com/voidzero-dev/void/releases/tag/v1.1.12). Use 1.1.12 or newer rather than overriding `URL.protocol` or removing the router's URL security check.

The patched client passed rendering, hydration, forms, D1 persistence and client-only page navigation in an iOS 26.1 simulator and Android API 36.1 emulator. Those results are the existing verification evidence; the published 1.1.12 artifacts have not been rerun as part of this documentation change. The sample and its pinned dependencies remain a historical baseline until that upgrade is verified.

Deployment, production authentication, native plugin events, Vue, Svelte, Solid, other Void bindings and local execution are unverified.

Authentication and authorization remain application responsibilities. The sample has no authentication and must not be deployed as a production data endpoint. Server-code removal is not a general secret detector; never embed credentials in client pages, public variables or Capacitor configuration.
