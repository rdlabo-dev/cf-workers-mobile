# Cloudflare bindings and execution policy

This folder owns cloud binding discovery and execution policy. It is separate
from the runtime APIs in `src/compat`, `src/browser` and `src/cloudflare/apis`.

| Source      | Responsibility                                                        |
| ----------- | --------------------------------------------------------------------- |
| `config.ts` | Read Wrangler binding declarations and explicit local/remote policies |
| `remote.ts` | Dispatch the original HTTP request to the deployed Worker             |
| `kv/`       | Local persistent KV adapter and its declared behavior profile         |

| Binding / service                                                                                  | Capacitor execution                          | Support status                                                                           |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| KV                                                                                                 | Explicit local or remote policy              | Local profile implemented; remote-dependent requests use cloud KV for the entire request |
| D1, Hyperdrive                                                                                     | Original HTTP handler on the deployed Worker | Request dispatch implemented; no local service implementation                            |
| R2                                                                                                 | Deployed Worker                              | Request dispatch implemented; no local R2 implementation                                 |
| Service Binding, Queue producers                                                                   | Deployed Worker                              | Request dispatch implemented; no local service RPC or queue lifecycle                    |
| Durable Objects, AI / AI Search, Vectorize, Workflows                                              | Deployed Worker                              | Binding detection and HTTP dispatch; no local cloud service implementation               |
| Analytics, Browser, Images, Stream/Media, rate limiting, mTLS, secrets, email, dispatch namespaces | Deployed Worker                              | Binding detection and HTTP dispatch; live execution of every service is not certified    |
| ASSETS                                                                                             | Explicit remote policy                       | Remote routing implemented; local ASSETS not implemented                                 |
| Unknown bindings / server secrets                                                                  | Explicit `remoteBindings` when required      | Structural unknown-binding checks; not a complete future Wrangler schema validator       |

See [binding declarations and limits](../../../docs/cloudflare-bindings.md),
[KV](../../../docs/kv.md), [D1](../../../docs/d1-transparent-migration.md),
[Hyperdrive](../../../docs/hyperdrive-transparent-migration.md), and
[service bindings](../../../docs/remote-service-bindings.md).
Remote dispatch sends whole HTTP requests, not generic binding method calls.
Cloud credentials and lifecycle stay on Workers. WebSocket upgrades are rejected.

Public `@rdlabo/workers-capacitor/cloudflare/bindings/kv` is the KV entry point; package
exports now point at this folder's compiled output. No placeholder per-service
implementation directories are created for services executed remotely.
