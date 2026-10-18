# Browser APIs and host mechanisms

This folder owns browser API implementations and adapters used by the WebView
runtime, including the adaptations needed for Workers behavior. The name describes
the API family; standalone browser support remains separate from Capacitor acceptance.
This is a source inventory, not a claim that every Web API is complete.

| API                              | Source                                    | Current implementation / verification                                        |
| -------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| AbortController / AbortSignal    | `abort/`                                  | Adapter, shared behavior contract and installation tests                     |
| TextEncoder / TextDecoder        | `encoding/`                               | Adapter and shared behavior contract                                         |
| Fetch                            | `fetch/`                                  | Workers policy, native transport integration and network/interop/scope tests |
| Headers                          | `headers/`                                | Owned implementation and shared behavior contract                            |
| Request                          | `request/`                                | Owned implementation and shared behavior contract                            |
| Response                         | `response/`                               | Owned implementation, shared behavior and installation contracts             |
| structuredClone                  | `structured-clone/`                       | Adapter and shared behavior contract                                         |
| Body codecs                      | `body/`                                   | Internal shared Request/Response implementation; not a separate public API   |
| Streams, URL and other host APIs | No separate implementation in this folder | Host/dependency use does not establish complete Workers parity               |

Current API scope and transport constraints are described in the
[compatibility guide](../../docs/compatibility.md).
API completion requires the full contribution gate.

Blob/File are shared with the Node Buffer implementation in `../compat/buffer/blob.ts`;
Web installation uses that same implementation rather than creating a second copy.

Cloudflare extensions to standard Request/Response APIs stay with their owning
Web API. Cloudflare-only APIs belong in [workers](../cloudflare/apis/README.md).

Browser-specific application mechanisms also live here: [documents](documents/README.md)
uses DOM/navigation/Service Worker facilities, and [isolated](isolated/README.md) uses
Dedicated Worker/MessageChannel facilities. Cross-mode request coordination lives
in [execution](../cloudflare/workers/README.md).
