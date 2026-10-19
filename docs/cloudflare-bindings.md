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

The Vite and esbuild plugins accept two forms of `execution`: a whole-Worker
mode (`"network"` or `"local"`), or an array of route permissions. Set it on the
build plugin, not on the runtime's `workersCapacitor()` call.

| Form                                        | Behavior                                                                                                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `execution: "network"` (default)            | Execute the entire Worker on the deployed server. Its implementation is excluded from the client Worker graph.                                                  |
| `execution: [{ method: "GET", path: "/" }]` | Permit selected route implementations and retained dependencies to ship to the device. Server dependencies and uncertain boundaries still keep requests remote. |
| `execution: "local"`                        | Permit distribution of the entire Worker and its dependencies. Intended for standalone applications; no route-splitting analysis or automatic remote fallback.  |

Start with the existing Worker entry and the deployed Worker's `remote.origin`.
No route classification is required to bring the app to Capacitor. Public client
assets can still be bundled locally while the Worker runs remotely. Once the app
works, explicitly select routes that may be distributed if local execution is
needed. A REST API prefix such as `/api/` does not establish that other routes
contain no private data.

For a standalone Worker whose entire source can ship to the device:

```ts
workersCapacitorPlugin({
  worker: "src/worker.ts",
  execution: "local",
});
```

This form works without Hono route analysis. It rejects configured server-only
bindings and lifecycle requirements. It does not emulate D1 or Firebase Admin,
check every undeclared credential, or guarantee runtime compatibility.

### Selecting local routes

For an existing Hono app, use an array to permit only selected routes:

```ts
workersCapacitorPlugin({
  worker: "src/worker.ts",
  execution: [
    { method: "GET", path: "/" },
    { method: "*", path: "/app/*" },
  ],
});
```

Selection happens against Hono registrations at build time, not against incoming
URLs. The example permits these implementations and their retained dependencies:

| Existing registration               | Selected?                                    |
| ----------------------------------- | -------------------------------------------- |
| `app.get("/", handler)`             | Yes                                          |
| `app.get("/app", handler)`          | Yes, as in Hono                              |
| `app.get("/app/home", handler)`     | Yes                                          |
| `app.post("/app/notes", handler)`   | Yes                                          |
| `app.get("/app/news/:id", handler)` | Yes; Hono matches the actual parameter value |
| `app.get("/application", handler)`  | No                                           |
| `app.get("/api/news", handler)`     | No                                           |

Permission does not guarantee local execution. Detected server dependencies,
shared state and overlapping server handlers or middleware can keep a selected
route remote. Unknown or unselected requests also stay remote, so array execution
always requires `remote.origin`, even if every current registration is selected.
An empty array permits no routes.

Inspect `remote` and `reason` in the generated `workers-capacitor-server.json`
(or `workers-capacitor-d1.json` for D1-only builds). Builds with a nonempty selection
but no local request handlers emit a warning. A selection matching no supported
registration in an analyzable Hono graph fails the build; an unsupported Worker
graph falls back to the whole remote Worker and reports why.

The setting does not create routes. `/app/missing` remains remote unless an
existing permitted Hono registration matches it. A selected wildcard registration
such as `app.get("/app/*", handler)` still uses Hono's own request semantics.

#### Path and method syntax

- An exact registered path such as `"/about"`, `"/posts/:id"`, or
  `"/posts/:id{[0-9]+}"` permits that registration. Hono handles its URL matching.
- A trailing wildcard on a literal prefix, such as `"/app/*"`, permits `/app`
  itself and registrations under `/app/`. It does not select `/application` or
  `/app-private`. Static prefixes such as `/v1.0/*` and `/@me/*` are supported.
- `"*"` and `"/*"` select all supported registration paths.
- A JavaScript `RegExp`, for example `{ method: "GET", path: /^\/pages\// }`,
  tests registration text. Use `^` and `$` to anchor matches as needed. Each match
  starts at index zero, including expressions with `g` or `y`; the supplied
  expression is not mutated.
- An uppercase HTTP method selects that method's registrations. `method: "*"`
  includes all supported direct HTTP-method registrations and `app.all()`, but
  does not independently permit middleware. Hono retains its request semantics,
  including HEAD handling through GET when applicable.

Patterns also permit matching registrations added in future builds. A method of
`"*"` includes future POST and DELETE operations at those paths. Use narrow
patterns when broader distribution permission is not intended.

Current selection supports direct registrations on the exported Hono router.
Mounted routes (`app.route()`), `basePath`, and `on()` are not resolved for grants.
The build does not infer containment between arbitrary Hono patterns:
`"/posts/:id"` does not grant a separate `"/posts/:slug"` or `"/posts/123"`
registration. Copy the registered pattern or use a literal-prefix wildcard.

#### Whole-Worker mode versus all-route selection

`execution: [{ method: "*", path: "*" }]` still analyzes and separates routes,
requires a remote connection, and preserves detected server boundaries.
`execution: "local"` distributes the whole Worker without that analysis and can
run standalone. Do not switch to `"local"` merely to bypass a route-selection
error; it grants permission to distribute the entire application implementation.

#### TypeScript configuration

Both tooling entry points export the same types:

```ts
import type { WorkerExecution } from "workers-capacitor/tooling/vite";

const execution = [
  { method: "GET", path: "/" },
  { method: "*", path: "/app/*" },
] as const satisfies WorkerExecution;
```

### What can move to the device

The device owner can read and modify bundled code, source maps and fixed data.
Array execution is explicit permission to distribute selected implementations
and their retained dependencies, not an authentication detector or a secret scan.
A handler that reads `settings.title` may retain private siblings in `settings`.
A hard-coded token check may distribute both the token and the guarded data.
Keep those implementations on the server rather than granting them permission.
HTTP methods, purity, HTML output, `ssr: false` and prerendering do not establish
that code is suitable for distribution.

Server bindings, unresolved execution dependencies, shared mutable state and
uncertain routing widen the remote boundary. Middleware may accompany a selected
route only when it is an unconditional `await next()` passthrough; other middleware
is kept remote along with overlapping handlers. Custom error/not-found handlers
keep request execution remote. The build removes remote implementations and
exclusive dependencies before creating client source maps.

Do not put secrets in client `env`, bundler defines, `workerFiles` or public assets.
These inputs are outside Worker-source exclusion. Separately bundled client assets
also bypass Worker routing and must be public. Remote operations still need
server-side authentication and authorization; neither execution form replaces them.
KV and ASSETS default to remote in network mode. Other execution forms require
explicit binding policies where applicable. Unsupported Worker shapes fall back
to network when using route selection; this does not establish automatic partitioning
of Void or OpenNext bundles.

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

`assetsExecution: "remote"` is required for route-selection builds when Wrangler
declares an `assets` section; network mode selects it by default. Processing through the ASSETS binding remains on the deployed Worker, including HTML
handling, SPA/404 routing, control files, range/conditional requests and cache
semantics. The client does not implement these APIs.

```ts
workersCapacitorPlugin({ worker: "src/worker.ts", assetsExecution: "remote" });
```

Asset-first or pattern-based routing (and declarations without a binding name)
keeps Worker dispatch remote to preserve the deployed routing order. With `run_worker_first: true` and a binding name, the normal conservative
analysis can keep explicitly selected independent routes local; any handler using `env.ASSETS` runs
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
