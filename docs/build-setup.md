# Build setup

## Supported builds

| Build              | Setup                                      | Input                                             |
| ------------------ | ------------------------------------------ | ------------------------------------------------- |
| Vite 7             | `workers-capacitor/tooling/vite` plugin    | TypeScript / JavaScript, Workers Hono and Express |
| esbuild 0.28       | `workers-capacitor/tooling/esbuild` plugin | TypeScript / JavaScript, Workers Hono and Express |
| Browser ES Modules | Explicit Worker source below               | Browser-compatible JavaScript only                |

Other bundlers are not currently supported. Add these plugins only to the Capacitor/browser build, never the Cloudflare build.

## Vite

Add the plugin to the Capacitor/browser Vite configuration:

```ts
import { defineConfig } from "vite";
import { workersCapacitorPlugin } from "workers-capacitor/tooling/vite";

export default defineConfig({
  plugins: [workersCapacitorPlugin({ worker: "./src/worker.ts" })],
});
```

`src/worker.ts` is your existing application entry exporting a Fetch Handler (for example, Hono’s `export default app`), not a library transport module. The plugin's `worker` path is relative to the Vite root (absolute paths also work). The plugin connects that entry to the normal package import; no special import or generated source file is needed in application code.

## esbuild

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

## Browser ES Modules (no bundler)

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
import { serve } from "./lib/browser/isolated/transport.js";
import worker from "./worker.js";
serve(worker);
```

`worker.js` exports the existing Fetch Handler. All its dependencies must also be browser-compatible ES Modules with resolvable URLs. This path does not transform TypeScript, bare npm imports, Node APIs or `cloudflare:*` imports. The public bundled equivalent of `lib/browser/isolated/transport.js` is `workers-capacitor/browser/isolated`.

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

Use the plugin shown above only in the Capacitor/browser build, never the Cloudflare build. It supplies Workers-compatible `node:http` and `node:net` adapters alongside browser polyfills; the [compatibility inventory](compatibility.md) records the verified baseline and modules. `listen(3000)` registers an in-memory handler, not a listening TCP port. The plugin supports both Hono and Workers Express; framework code stays unchanged.

## TypeScript types

The package provides the `cloudflare:node` type for its supported `httpServerHandler` adapter. For a browser build without existing Workers type declarations, add it to `compilerOptions.types` in `tsconfig.json`:

```json
{ "compilerOptions": { "types": ["workers-capacitor/cloudflare/apis/types"] } }
```

Keep any other types your project already uses. This is a type-only entry; do not import it at runtime. Projects with generated Workers types should keep those declarations instead. No application-owned `cloudflare.d.ts` or `client.d.ts` is needed.
