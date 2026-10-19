# Build setup

Choose your application's framework first, then configure the build tool used for
its Capacitor integration. The framework guide identifies the Worker entry and
execution boundary; the tool plugin connects that entry to the mobile app.
Keep the existing Cloudflare build separate.

## Frameworks

The following integrations have examples and verification evidence. Support is
scoped to the execution paths described here; see the [compatibility limits](compatibility.md)
for API and application restrictions.

| Framework          | Execution and verified scope                                                                                                                                                                                    | Setup                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Hono               | Local Fetch handlers and HTML pages; routing, forms and request/response behavior are exercised in the Hono fixtures. Cloud-dependent requests use remote dispatch.                                             | [Hono entry](#hono), [native rendering example](../demo/rendering)                       |
| Workers Express    | Local execution through `cloudflare:node`; API and HTML rendering fixtures. Cloud-dependent requests use remote dispatch.                                                                                       | [Workers Express entry](#workers-express), [native rendering example](../demo/rendering) |
| Void React Pages   | SSR, loaders and actions on the remote Worker; client hydration and forms in the WebView. Use Void / @void/react 1.1.12 or newer; published 1.1.12 packages pass iOS simulator and Android emulator acceptance. | [Void setup and verification](void.md)                                                   |
| Next.js / OpenNext | D1-backed sample uses the whole remote Worker. A separate local profile verifies public SSR pages, hydration, links and assets; it does not establish local D1 or ASSETS support.                               | [OpenNext setup and limits](opennext.md)                                                 |

### Hono

Connect the application's existing Fetch Handler. For example:

```ts
import { Hono } from "hono";

const app = new Hono();
app.get("/", (c) => c.html("<h1>Hello from Hono</h1>"));
app.get("/api/hello", (c) => c.json({ hello: "world" }));
export default app;
```

Point the [Vite](#vite) or [esbuild](#esbuild) plugin's `worker` option at this
entry. Use `render: "/"` for Worker-owned pages, or omit `render` when integrating
an existing frontend with the API. Follow the [application integration guide](integration.md)
for Capacitor setup, cloud bindings and authentication.

Start with the default `execution: "auto"`; no route list is required. To choose
which route implementations may ship to the device, use the build plugin's
`execution: "manual"` and `localRoutes`. Exact paths, `/app/*` prefixes and regular
expressions are supported. This permission includes retained dependency data and
does not override detected server dependencies. See [local route selection](cloudflare-bindings.md#selecting-local-routes)
before enabling it.

### Workers Express

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

Use the [Vite](#vite) or [esbuild](#esbuild) plugin only in the Capacitor/browser build, never the Cloudflare build. It supplies Workers-compatible `node:http` and `node:net` adapters alongside browser polyfills; the [compatibility inventory](compatibility.md) records the verified baseline and modules. `listen(3000)` registers an in-memory handler, not a listening TCP port. The plugin supports both Hono and Workers Express; framework code stays unchanged.

The default `execution: "auto"` only partitions supported Hono routes. An Express
Worker stays entirely remote and requires `remote.origin` in `workersCapacitor()`.
For a deliberately standalone Express app, add `execution: "local"` to the
Vite or esbuild plugin options below. This permits the entire Worker implementation
and retained fixed data to ship to the device; do not use it with server secrets.
Configured server bindings make `local` fail the build. See
[execution policies](cloudflare-bindings.md#choosing-execution).

#### TypeScript types

The package provides the `cloudflare:node` type for its supported `httpServerHandler` adapter. For a browser build without existing Workers type declarations, add it to `compilerOptions.types` in `tsconfig.json`:

```json
{ "compilerOptions": { "types": ["workers-capacitor/cloudflare/apis/types"] } }
```

Keep any other types your project already uses. This is a type-only entry; do not import it at runtime. Projects with generated Workers types should keep those declarations instead. No application-owned `cloudflare.d.ts` or `client.d.ts` is needed.

### Angular on Workers

This integration is not yet verified. The target is an **existing Angular SSR
application deployed on Cloudflare Workers**, preserving its rendering, routing
and hydration when brought to Capacitor. A dedicated Worker-entry configuration
and acceptance sample are still needed before it can be listed as supported.

Vite or esbuild support alone does not establish Angular SSR support. The
Fetch-only integration of a separate frontend is a different use case.

## Tools

These versions describe the separate Capacitor build. A framework's existing
cloud build may use a different tool or version; keep it unchanged and connect
its generated Worker as described in the framework guide.

| Build              | Setup                                      | Input                                                                              |
| ------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| Vite 7             | `workers-capacitor/tooling/vite` plugin    | TypeScript / JavaScript Worker entries, including framework output described above |
| esbuild 0.28       | `workers-capacitor/tooling/esbuild` plugin | TypeScript / JavaScript Worker entries, including framework output described above |
| Browser ES Modules | Explicit Worker source below               | Browser-compatible JavaScript only                                                 |

Other bundlers are not currently supported. Add these plugins only to the Capacitor/browser build, never the Cloudflare build.

### Vite

Add the plugin to the Capacitor/browser Vite configuration:

```ts
import { defineConfig } from "vite";
import { workersCapacitorPlugin } from "workers-capacitor/tooling/vite";

export default defineConfig({
  plugins: [workersCapacitorPlugin({ worker: "./src/worker.ts" })],
});
```

`src/worker.ts` is your existing application entry exporting a Fetch Handler (for example, Hono’s `export default app`), not a library transport module. The plugin's `worker` path is relative to the Vite root (absolute paths also work). The plugin connects that entry to the normal package import; no special import or generated source file is needed in application code.

### esbuild

For esbuild, use the same application code with this build configuration:

```js
import { build } from "esbuild";
import { workersCapacitorPlugin } from "workers-capacitor/tooling/esbuild";

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

This path is for Fetch-only integration and does not automatically prepare native document assets. Without a bundler, copy the package's `dist` directory to your public `lib` directory and use ordinary relative ES Module imports:

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
import { serve } from "./lib/browser/isolated/transport.js";
import worker from "./worker.js";
serve(worker);
```

`worker.js` exports the existing Fetch Handler. All its dependencies must also be browser-compatible ES Modules with resolvable URLs. This path does not transform TypeScript, bare npm imports, Node APIs or `cloudflare:*` imports. The public bundled equivalent of `lib/browser/isolated/transport.js` is `workers-capacitor/browser/isolated`.
