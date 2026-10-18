# Cloudflare bindings in Capacitor

This is HTTP request dispatch, not a client implementation of Cloudflare services.
The build detects cloud dependencies and sends the original request to the
existing deployed Worker **before local application handlers run**. The Worker
uses its own bindings, credentials, RPC, storage and lifecycle. There is no generic
public binding proxy, client credential bundle, automatic retry or offline queue.

## Remote services

In addition to D1, Hyperdrive, R2, Service Bindings and Queue producers, the
Vite and esbuild plugins discover these Wrangler declarations:

| Service                                          | Configuration containing the binding name               |
| ------------------------------------------------ | ------------------------------------------------------- |
| Durable Objects (including Container namespaces) | `durable_objects.bindings[].name`                       |
| Workers AI                                       | `ai.binding`                                            |
| Vectorize                                        | `vectorize[].binding`                                   |
| AI Search                                        | `ai_search[].binding`, `ai_search_namespaces[].binding` |
| Workflows                                        | `workflows[].binding`                                   |
| Analytics SQL                                    | `analytics.binding`                                     |
| Analytics Engine                                 | `analytics_engine_datasets[].binding`                   |
| Browser Run                                      | `browser.binding`                                       |
| Images                                           | `images.binding`                                        |
| Stream / Media Transformations                   | `stream.binding`, `media.binding`                       |
| Rate Limiting                                    | `ratelimits[].name`                                     |
| mTLS                                             | `mtls_certificates[].binding`                           |
| Secrets Store                                    | `secrets_store_secrets[].binding`                       |
| Email sending                                    | `send_email[].name`                                     |
| Workers for Platforms                            | `dispatch_namespaces[].binding`                         |

JSON, JSONC, TOML and named environments are supported. As with existing service
bindings, names from all environments are considered conservatively; the deployed
Worker's actual environment determines which resources execute. Wrangler's
`remote: false` development option does not make a cloud service local in Capacitor.
Resource IDs, model/index names, certificates and secret values are not copied
from Wrangler into the client.

```ts
workersCapacitorPlugin({
  worker: "src/worker.ts",
  workerConfig: "wrangler.jsonc", // optional if auto-discovered
  remoteBindings: ["PAYMENT_SECRET", "FUTURE_SERVICE"],
  kvExecution: { SETTINGS: "local" },
});
```

`remoteBindings` adds server-only names, including ordinary secrets that are not
listed in Wrangler, and bindings configured by other tools. It does not replace
discovery of known services. A name cannot also appear in `localBindings`.
Supply `remote.origin` to `workersCapacitor` as for existing remote services.
Do not inject server secrets through the client runtime's `env` or bundler defines.

Unknown configuration objects containing `binding`, or nested `bindings` entries
using `name` (for example `unsafe.bindings`), fail the build unless their names
are explicitly listed in `remoteBindings`. This is structural detection, not a
complete Wrangler schema validator: arbitrary future declaration formats and
secrets configured only in the dashboard still require explicit names. `vars`
and `define` values are not interpreted as binding declarations or copied into env.

A request using any remote binding executes entirely remotely, even when the
same handler also reads local-configured KV or ASSETS. Cloud instances are used
for the entire request. Conservative whole-Worker fallback preserves shared
state, additional exports, middleware and error handling. Review the generated
`workers-capacitor-server.json` report.

Durable Object HTTP and RPC calls inside the original HTTP handler are supported
by this dispatch path. **WebSocket/HTTP upgrades are not supported by this
transport** and reject explicitly. Use a separate connection to the deployed
Worker for WebSockets; this release does not provide automatic WebSocket routing.

Configured Cron handlers, Queue consumers and `exports` declarations of Durable
Objects or Workflows keep the whole Worker remote, including its HTTP handler.
The client does not simulate scheduled events, alarms, Workflow steps or queue
consumption. An Email handler or other server event without a discoverable
configuration declaration is not automatically detected merely from its purpose.

## Local ASSETS binding

`assetsExecution` is required when Wrangler has an `assets` section. Choose
`remote` for Cloudflare's complete asset routing semantics. Asset-first routing
(or configuration without a binding name) keeps the whole Worker remote so local
handlers cannot bypass the deployed routing order.

Choose `local` for this explicitly supported profile:

```jsonc
// wrangler.jsonc
{
  "assets": {
    "directory": "./public",
    "binding": "ASSETS",
    "run_worker_first": true,
    "html_handling": "none",
    "not_found_handling": "single-page-application",
  },
}
```

```ts
// Vite or esbuild plugin
workersCapacitorPlugin({ worker: "src/worker.ts", assetsExecution: "local" });
```

```ts
// Capacitor bootstrap; public/app-shell.html must be included in the app build.
import { workersCapacitor } from "@rdlabo/workers-capacitor";
import { LocalAssets } from "@rdlabo/workers-capacitor/features/assets";

const assets = new LocalAssets(
  {
    "/": "/app-shell.html",
    "/index.html": "/app-shell.html",
    "/logo.svg": "/logo.svg",
  },
  {
    baseURL: window.location.href,
    notFoundHandling: "single-page-application",
  },
);
const runtime = workersCapacitor({
  baseURL: "https://app.example",
  env: { ASSETS: assets },
  // Add remote: { origin: "https://app.example" } if the build selects remote routes.
});
await runtime.ready;
```

The existing Worker still calls `env.ASSETS.fetch(request)` unchanged. As with
local KV, the app supplies the runtime instance; the build does not automatically
copy an arbitrary Wrangler directory into the mobile app. Vite public assets or
explicitly emitted esbuild assets can supply these URLs. Keep the app bootstrap
and Worker-rendered HTML separate to avoid recursively bootstrapping the runtime.

The manifest maps literal URL pathnames (percent-encoded where appropriate) to
packaged asset URLs. The request hostname and query do not choose a backend.
Only same-app-origin manifest URLs are accepted; caller cookies and Authorization
are not forwarded and redirects are rejected. Files are fetched on demand through
the captured platform fetch, bypassing Worker routing. Bodies stream without a
whole-directory preload, base64 embedding, or an in-memory asset cache. Local
responses use `Cache-Control: no-store` and omit validators/range advertising
because this profile does not implement conditional or range requests.

Supported behavior is exact paths, GET/HEAD, 404, 405 and optional SPA fallback to
`/index.html`. Set `notFoundHandling` to match Wrangler's `not_found_handling`.
For exact-path routing without SPA, map `/` explicitly if it should serve an
index page. The manifest is authoritative; a listed but missing packaged file
raises an error instead of silently returning the app host's missing response.
Ensure the host does not turn a missing listed file into a status-200 SPA page.

Automatic HTML canonicalization, asset-first/pattern routing, `_headers`,
`_redirects`, `404-page`, range/conditional requests and Cloudflare cache semantics
are outside this local profile. Unsupported configured routing profiles fail the
build; `_headers`/`_redirects` found in a configured directory also fail the build.
Do not supply equivalent unhandled control files through another packaging path.
Conditional/range requests fail explicitly at runtime. Manifest membership
is explicit and does not evaluate `.assetsignore`. Use remote assets when these
features are required. Packaged resources are public client data, never a location
for secrets or server source.

Function-bearing `env.ASSETS` selects direct execution even with `prefer: "worker"`;
there is no binding RPC bridge into a Dedicated Worker. Adding a remote dependency
does not invoke the local asset binding before forwarding. Existing document
asset hosting/service-worker precaching is independent from this API.

## Verification and limits

- `npm test`: discovery, explicit-policy errors, unknown binding diagnostics,
  server code exclusion, routing precedence, local streaming/cancellation and
  upgrade rejection.
- `npm run test:cloudflare-bindings` in `demo`: real workerd Durable Object storage,
  HTTP and RPC calls, authorization rejection without state changes, Vite/esbuild
  artifact inspection (including source maps), Chromium/WebKit, direct/Worker
  modes, and lazy local ASSETS GET/HEAD/SPA behavior. Local binding injection
  selects direct mode as documented.
- Cloud AI, indexes and Workflows are covered by discovery/dispatch analysis, not
  paid live-service tests. Local workerd and browser tests do not certify deployed
  Cloudflare resources, physical devices or native WebSocket support.

Cache API and HTMLRewriter compatibility are separate runtime work; this change
does not add them.

## References

- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Assets binding and routing](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [AI Search bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/ai-search/)
- [Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
