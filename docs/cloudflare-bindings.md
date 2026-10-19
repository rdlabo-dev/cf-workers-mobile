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
same handler also reads local-configured KV. Cloud instances are used
for the entire request. Conservative whole-Worker fallback preserves shared
state, additional exports, middleware and error handling. Review the generated
`workers-capacitor-server.json` report.

### Choosing execution

The Vite and esbuild plugins accept the same `execution` policy. Start with
`auto` (the default); use `network` when server execution is preferable, and
`manual` when you want to explicitly permit selected routes. `local` is for
applications deliberately designed to run entirely on the device.

You do not need to classify every route before trying the app. Start with your
existing Worker entry and configure the deployed Worker's `remote.origin` in
the runtime. Leave `execution` unset to use `auto`, then check the generated
dispatch report and verify the app's pages and API calls.

Separating REST APIs under `/api/` does not make every other route suitable for
distribution: `/account`, for example, may contain session checks or private data.
No path prefix is treated as proof of publication permission. If you need to
choose the boundary yourself, use `manual` to list the routes whose code and
dependencies may be shipped to the device. Everything unselected stays on the
server, including routes added later. There is no need to list all server routes.

| Policy    | Distribution permission and execution                                                                                                                                                                |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto`    | Analyze every Worker, including applications without Cloudflare bindings. Only supported Hono responses with a provable distribution boundary become local; unresolved cases remain on the server.   |
| `network` | Keep the entire Worker on the server. Its implementation and fixed data are excluded from the client Worker graph.                                                                                   |
| `manual`  | Permit selected routes and their retained dependencies to be distributed. Unselected routes stay remote; permission does not override detected server dependencies or overlapping server middleware. |
| `local`   | Permit distribution of the entire Worker implementation and fixed data. There is no automatic server fallback or source-removal analysis.                                                            |

```ts
workersCapacitorPlugin({
  worker: "src/worker.ts",
  execution: "manual",
  localRoutes: [
    { method: "GET", path: "/" },
    { method: "GET", path: "/about" },
  ],
});
```

`localRoutes` is available only with `manual`. Use uppercase HTTP methods (or
`"*"` for all methods) and
exact Hono registration paths, a trailing `/*`, or JavaScript regular expressions:

```ts
localRoutes: [
  { method: "GET", path: "/" },
  { method: "*", path: "/app/*" },
  { method: "GET", path: /^\/pages\// },
  { method: "*", path: /^\/notes\// },
],
```

`"/app/*"` selects registrations starting with `/app/`, including nested paths
such as `/app/news/:id`. It does not select `/app`, `/application`, or
`/app-private`; add `/app` separately if needed. Only a trailing `/*` has wildcard
meaning; other strings remain exact matches. This is not a general glob syntax.

A regular expression or wildcard tests the registered path at build time, not the incoming
URL. For example, `/^\/pages\//` permits both `/pages/about` and
`/pages/news/:id`; Hono still matches actual requests and route parameters.
Use `^` and `$` when you need to anchor the match. Matching future registrations
also receive permission, so keep patterns narrow. Each match starts at index zero,
including expressions with `g` or `y`; the supplied expression is not mutated.
These settings are not authorization rules. Currently, manual selection requires direct
registrations on the exported Hono router; mounted routes, `basePath`, and `on()`
registrations are not resolved for manual permission. For an analyzable Hono
graph, an unresolved selection fails the build rather than broadening permission.
An unsupported Worker graph stays entirely remote. An empty list permits no routes.
`method: "*"` selects every supported direct HTTP-method registration and
`app.all()` at the matching paths. It does not grant middleware permission or
override server dependencies. It also permits matching methods added later;
use a specific method when that broader distribution permission is not intended.
The example assumes direct `app.get("/", ...)` and `app.get("/about", ...)`
registrations. Copy your application's actual registration paths; this setting
does not create new routes or require rewriting the existing Worker.

Permission includes retained fixed data, not just response bodies. For example,
permitting a handler that reads `settings.title` can distribute private siblings
in `settings`. Keep secret-containing modules outside manually permitted routes.
This includes inline authentication: permitting a route containing a hard-coded
token check permits that token and the guarded fixed data to be distributed.
`manual` is not an authentication detector. Leave such routes out of `localRoutes`
(or select `network`) to keep them server-side. Recognized server dependencies
and overlapping remote middleware still prevent local execution.
POST can be local for standalone device operations; HTTP methods do not establish
whether code is safe to distribute.

`local` rejects configured server bindings and server-only lifecycle requirements.
It cannot detect every undeclared credential or unsupported dependency; the whole
Worker source may be visible to the device owner. Use it only after reviewing that
source and testing the application's runtime dependencies. It does not emulate D1,
Firebase Admin or other server services.

Remote execution still requires the runtime's `remote.origin` and server-side
authentication and authorization. `network` removes the Worker-source distribution
decision, not the need to secure requests. KV and ASSETS stay remote by default in
`network` mode. Client assets, client `env`, and separately embedded files remain
outside Worker-source removal.

### What can move to the device

The safety boundary is the original server behavior: moving code to the device
must not broaden access to information or grant authority previously enforced by
the server. Device bundles, including source maps, must be treated as readable and
modifiable. A remotely dispatched route is not protected if its private data is
still shipped in the local bundle.

Response data and the code that produces it are different distribution units.
For example, returning `settings.title` does not permit shipping
`settings.apiSecret`, and returning a signature does not permit shipping its
signing key. Likewise, data returned only after authentication must not become
available to everyone who downloads the app. Runtime compatibility and purity
alone establish none of these permissions.

In `auto`, the existing Worker remains the baseline. Being able to execute a function in JavaScript is not enough to make its
source distributable. A local candidate must also fit the supported response
construction pattern: a straight-line `c.text`, `c.html`, `c.json`, `c.body` or
`new Response`, using inline response values, request values, or explicitly local
bindings. Simple helpers returning primitive values or `hono/html` templates are
supported. A helper must use every argument and have no default parameters.

Objects imported from application modules or JSON, object property projections,
conditional helpers and arbitrary transformations stay on the server. Reading a
public field is not permission to copy its siblings. Unsupported response options,
ignored arguments and nonempty bodies with bodyless statuses also stay remote.
Nested Response objects stay remote: serializing or coercing a Response does not
necessarily expose its body, even though the body remains in the source.
Public JSON literals are supported; duplicate properties and prototype fields are
not. This intentionally favors a small distribution contract over a general
JavaScript optimizer. JSX/component implementations outside this pattern remain
remote, even when their dependencies can execute in a browser.

Execution checks still apply: unknown host globals, outbound `fetch`, opaque
packages, `hono/adapter`, Workers-specific context and unknown environment values
stay remote. Escaped globals or rendering imports, dynamic runtime capabilities,
ambient mutation and unproven shared state can keep the whole Worker remote.
Only lexical variable references pull declarations into generated code; matching
property names do not import unrelated application data.

Remote middleware and overlapping handlers remove the protected handler and its
exclusive dependencies from the client bundle, not just from local execution.
The build uses conservative static path prefixes only to establish disjointness;
it does not implement a second Hono router. Uncertain mounted-router boundaries
and overlapping local responses keep the whole Worker remote. A middleware is
locally eligible only for unconditional `await next()`. Response-header writes
and custom response headers remain remote in `auto`: later writes can discard
earlier values that would otherwise remain in distributed source.
Disjoint public pages can still render locally. KV operations explicitly configured
as local continue to use device storage; a request that also requires a cloud
service executes entirely on the deployed Worker.

The generated report includes each registration's `reason` and its final
`remote` decision after distribution boundaries are applied. `auto` requires no route
annotations or publication settings.

These checks do not classify the meaning of every literal. Values intentionally
returned by an unprotected supported handler are treated as response data, not
as secrets. Authentication implemented outside the Worker, such as an upstream
access policy, is not inferred from its source. Do not rely on a private URL,
obfuscation or a private source repository to protect bundled data. Do not place
secrets in client `env`, bundler defines, `workerFiles` or public assets.

Analysis does not depend on a Cloudflare binding declaration. Unknown Worker
shapes stay remote in `auto`; this is not a general secret scanner or automatic
partitioning of Void or OpenNext bundles. `ssr: false` and prerendering are not distribution contracts.

Durable Object HTTP and RPC calls inside the original HTTP handler are supported
by this dispatch path. **WebSocket/HTTP upgrades are not supported by this
transport** and reject explicitly. Use a separate connection to the deployed
Worker for WebSockets; this release does not provide automatic WebSocket routing.

Configured Cron handlers, Queue consumers and `exports` declarations of Durable
Objects or Workflows keep the whole Worker remote, including its HTTP handler.
The client does not simulate scheduled events, alarms, Workflow steps or queue
consumption. An Email handler or other server event without a discoverable
configuration declaration is not automatically detected merely from its purpose.

## Remote ASSETS binding

`assetsExecution: "remote"` is required when Wrangler declares an `assets`
section. Processing through the ASSETS binding remains on the deployed Worker, including HTML
handling, SPA/404 routing, control files, range/conditional requests and cache
semantics. The client does not implement these APIs.

```ts
workersCapacitorPlugin({ worker: "src/worker.ts", assetsExecution: "remote" });
```

Asset-first or pattern-based routing (and declarations without a binding name)
keeps Worker dispatch remote to preserve the deployed routing order. With `run_worker_first: true` and a binding name, the normal conservative
analysis can keep independent routes local; any handler using `env.ASSETS` runs
remotely. Nothing from the asset directory is automatically copied into Capacitor.

**Local ASSETS is not implemented or exported by this change.** A future local
implementation must satisfy the complete ASSETS contract, including HTML handling,
control files, conditional/range behavior and workerd/native parity.
`assetsExecution: "local"` fails explicitly rather than enabling a partial implementation.
Bundled document assets are separate: Vite `publicDir` (or files copied before an esbuild build) registers exact local paths that bypass Worker dispatch. Use this only for public files that need no server middleware, authorization or Cloudflare response-header/control-file processing. The [OpenNext](opennext.md#bundle-client-assets-alongside-remote-pages) and [Void](void.md) examples bundle client scripts while retaining their server handlers remotely.

## Verification and limits

The application-worker baseline is Miniflare `5.20261012.0-beta`, compatibility
date `2026-10-01`, with no additional application compatibility flags. The named
unit is build-generated HTTP dispatch, not local emulation of cloud binding APIs.

- `npm test`: binding discovery, policy errors, unknown binding diagnostics,
  server code exclusion, remote routing precedence and upgrade rejection.
  Distribution cases inspect both minified JavaScript and source maps, including
  protected HTML/JSON, mixed public/private configuration, helper branches,
  ignored values and mounted/overlapping routes.
- `npm run test:d1-migration` in `demo`: workerd/browser dispatch checks and
  Vite/esbuild builds that retain independent public rendering while excluding
  protected data from every emitted asset. The protected fixture also checks
  original Hono behavior: unauthenticated requests receive 401 and authenticated
  requests receive the private response.
- `npm run test:cloudflare-bindings` in `demo`: real workerd Durable Object HTTP,
  RPC and storage, authorization rejection without state changes, remote ASSETS,
  Vite/esbuild artifact inspection, Chromium/WebKit direct/Worker modes, both
  worker-first and asset-first routing, and Vite development startup. Requests use
  an actual local HTTPS server, not browser route interception. Conditional 304
  responses are observed with browser HTTP caching disabled by the test server;
  Range responses are compared with the same request sent directly to workerd.
  This verifies forwarding, not a client recreation of Cloudflare cache behavior.
- Cloud AI, indexes and Workflows are verified as names for HTTP dispatch, not
  emulated APIs or paid live-service tests. Native transport contracts are shared
  with existing remote services.

Cache API, HTMLRewriter and local ASSETS are separate unfinished compatibility
units; the package does not activate them in production aliases or exports.

## References

- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Assets binding and routing](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [AI Search bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/ai-search/)
- [Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
