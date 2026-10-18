# Application runtime

| Folder       | Responsibility                                                                |
| ------------ | ----------------------------------------------------------------------------- |
| `fetch/`     | Application request interception, local/remote selection and direct execution |
| `isolated/`  | Dedicated Worker startup, protocol and lifecycle                              |
| `documents/` | Document hosting, rendering, registration and service-worker assets           |

`fetch/feature.ts` connects the Fetch runtime to the reusable contract host.
`fetch/contract.ts` owns its portable HTTP behavior profile and fixture. Public
`features/fetch` and `testing/fetch` imports remain available through package exports.

This Fetch runtime is distinct from `src/browser/fetch`, which owns Fetch API
semantics and outbound networking. The runtime uses the cloud-specific request
transport in `src/cloudflare/bindings/remote.ts`; it does not emulate cloud services.
