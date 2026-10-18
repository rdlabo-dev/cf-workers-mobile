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
section. All asset processing remains on the deployed Worker, including HTML
handling, SPA/404 routing, control files, range/conditional requests and cache
semantics. The client does not implement these APIs.

```ts
workersCapacitorPlugin({ worker: "src/worker.ts", assetsExecution: "remote" });
```

Asset-first or pattern-based routing (and declarations without a binding name)
keeps every request remote so client code cannot bypass the deployed routing
order. With `run_worker_first: true` and a binding name, the normal conservative
analysis can keep independent routes local; any handler using `env.ASSETS` runs
remotely. Nothing from the asset directory is automatically copied into Capacitor.

**Local ASSETS is not implemented or exported by this change.** A future local
implementation must satisfy the complete ASSETS contract, including HTML handling,
control files, conditional/range behavior and workerd/native parity.
`assetsExecution: "local"` fails explicitly rather than enabling a partial implementation.
Existing document asset hosting is a different feature and remains unchanged.

## Verification and limits

- `npm test`: binding discovery, policy errors, unknown binding diagnostics,
  server code exclusion, remote routing precedence and upgrade rejection.
- `npm run test:cloudflare-bindings` in `demo`: real workerd Durable Object HTTP,
  RPC and storage, authorization rejection without state changes, remote ASSETS,
  Vite/esbuild artifact inspection, and Chromium/WebKit direct/Worker modes.
- Cloud AI, indexes and Workflows are verified as names for HTTP dispatch, not
  emulated APIs or paid live-service tests. Native transport contracts are shared
  with existing remote services. Evidence and review scope are recorded separately.

Cache API, HTMLRewriter and local ASSETS are separate unfinished compatibility
units; this PR does not activate them in production aliases or exports.

## References

- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Assets binding and routing](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [AI Search bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/ai-search/)
- [Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
