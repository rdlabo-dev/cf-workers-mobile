# Workers Capacitor demo

This demo shows the setup needed to run an existing Workers Fetch Handler inside Capacitor. Start with the application files below; compatibility tests have their own sources and build.

## 1. Choose your existing Worker

[vite.config.ts](vite.config.ts) points the plugin at the Worker entry:

```ts
plugins: [
  workersCapacitorPlugin({
    worker: "./workers/hono/standard.ts",
    // To use Express, replace the line above with:
    // worker: "./workers/express/standard.ts",
  }),
];
```

The path is relative to the configured Vite root, `src/`. The example uses [the Hono Worker](src/cloudflare/apis/hono/standard.ts). To try [Workers Express](src/cloudflare/apis/express/standard.ts), replace the active `worker` line with the commented `./workers/express/standard.ts` line in the Vite config. No changes to `main.ts` are needed.

## 2. Initialize and display the Worker page

[src/main.ts](src/main.ts) initializes the runtime and displays the HTML returned by `/`:

```ts
import { workersCapacitor } from "@rdlabo/workers-capacitor";

const runtime = workersCapacitor({
  baseURL: "https://worker.invalid/",
});
await runtime.ready;

const response = await fetch("/");
if (!response.ok) throw new Error(`Worker returned ${response.status}`);
document.querySelector("#page")!.innerHTML = await response.text();
```

The page content is defined in the Worker: Hono uses `c.html()`, and Express uses `res.type("html").send()`. The same entry also exposes `/api/hello` as a JSON API. There is no separate frontend `app.ts` or custom startup function.

`baseURL` selects the origin and path handled locally. Its root path includes both `/` and `/api/hello`; these fetch calls do not contact `worker.invalid`.

This is the **Fetch-only** demo: it inserts the returned HTML into the existing page with `innerHTML`. That is only this example's minimal display step — it does not intercept navigation or form submissions, and scripts inside the returned HTML are not executed. It is not the native document rendering mechanism.

For Worker-owned documents on iOS and Android — where the same Worker HTML, routes, API and forms drive real page navigation — use `workersCapacitor({ baseURL, render: "/" })` as in [`rendering/`](rendering). That path uses the packaged native integration and needs no `innerHTML` replacement.

## Run the demo

From the repository root:

```sh
npm ci
npm run build
cd demo
npm ci
npm run dev
```

For the native app, run these from `demo/` with the native SDKs installed:

```sh
npm run build
npm run sync
npm run ios
# Or: npm run android
```

## Directory guide

| Location                                                        | Purpose                                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/`                                                          | The example application: initialization, HTML display, and existing Workers.                                       |
| `vite.config.ts`, `capacitor.config.ts`, `cloudflare.config.ts` | Build and execution settings for the example application.                                                          |
| `ios/`, `android/`                                              | Capacitor native projects for running the example.                                                                 |
| `tests/`                                                        | Automated checks, test-only apps and Workers, and test preparation scripts. See [the test guide](tests/README.md). |
| `dist/`, `artifacts/`, `test-results/`                          | Generated application builds, validation builds/evidence, and test output. Not source files.                       |

## Compatibility tests

`tests/validation/` and `tests/fixtures/` contain the validation app and test-only Workers. `npm run test:browser` builds the same demo once with Hono and once with Express, then checks both pages in Chromium and WebKit. The Express switch lives in [tests/vite.express.config.ts](tests/vite.express.config.ts), and assertions live in [tests/browser/demo.spec.ts](tests/browser/demo.spec.ts). The compatibility app is built and served separately. The normal `src/` application and its build do not depend on these files. See the [repository testing guide](../README.md#development-and-testing) for the full test commands.

The [document-rendering experiment](../docs/document-rendering.md) is the earlier investigation of Hono/TSX and Express pages, scripts, and top-level navigation. It is not part of the setup above and not the shipping path; the packaged equivalent is [`rendering/`](rendering) below.

## Worker-rendered native documents

[`rendering/`](rendering) is a separate example using `workersCapacitor({ render: "/" })`.
It contains complete Hono/TSX and Workers Express pages. Native distribution
packaging uses iOS Swift Package Manager and Android Gradle; see its README and
the independent tarball-install tests.
