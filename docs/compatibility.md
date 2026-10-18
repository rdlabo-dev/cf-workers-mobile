# Compatibility and limitations

The target is Cloudflare Workers, not a standalone Node.js process. The Node
profile uses workerd `1.20261012.1`, compatibility date `2026-10-17`, without
additional flags. Other dates and flags are not covered by this profile.
The WebView does not contain workerd or V8; iOS uses its own JavaScript engine.

## Node.js

Whole-Node compatibility is incomplete. Importing a module successfully does not
establish equivalent methods, validation, state, scheduling or engine behavior.

| Area | Behavior and limitations |
| --- | --- |
| path, querystring, string_decoder, buffer, timers | Implement the pinned Workers profile. Workers stubs remain stubs; for example, matchesGlob reproduces the pinned rejection. |
| HTTP and net | In-memory server dispatch; no OS listening server. Outbound TCP/TLS requires the native transport. |
| fs / fs/promises | Read-only embedded virtual files. Writes, FileHandle, watch and full filesystem semantics are unsupported. |
| module | Limited builtin registry; createRequire loads VFS JSON only. Executable modules must be bundled; arbitrary dynamic resolution is unsupported. |
| process, events, console, util / util/types / sys | Incomplete exports or behavior. Engine introspection, call sites and host-object detection are not equivalent to Workers. |
| crypto and zlib | Dependency implementations do not cover all Workers exports, algorithms, keys or codecs. Do not assume cryptographic or compression parity. |
| TLS and HTTP internals | node:tls is incomplete. _http_common, _http_outgoing, _http_server, _tls_wrap and _stream_wrap fail the import audit. Native TLS transport does not imply Node TLS API compatibility. |
| Streams | A packaged fallback supplies byte streams when the host lacks them. Workers tee cancellation reasons and pipeTo abort timing are not fully reproduced. |
| async_hooks | Build-transformed async functions retain scoped stores. Untransformed native async callbacks reject; arbitrary dynamic code and request-origin isolation are not fully supported. |
| diagnostics_channel | Synchronous channel/store contracts are implemented; async propagation depends on the async-hooks limitations. |
| worker_threads | Workers stubs and local MessagePort behavior, not Node threads. Trusted-event branding, host-object serialization and global identity differ. |
| DNS | DNS-over-HTTPS implementation; synthetic Service Binding/Hyperdrive address overrides are not implemented. |
| Other modules | Implementations and shared contracts exist, but whole-module acceptance remains outstanding. Namespace equality alone is insufficient. |

The exact missing/extra export baseline is maintained in
[surface-gaps.json](../demo/tests/experiments/node-compat/surface-gaps.json), against
[the pinned exports](../demo/tests/experiments/node-compat/exports.json).
Those files are the source of truth; this guide does not duplicate the export list.
Run `npm run build`, then `npm run test:node-inventory --prefix demo` to check it.
Behavioral contracts live beside each implementation in `src/compat`.

Workers non-functional modules do not gain device capabilities: VM isolates,
process spawning, V8 heap access, UDP sockets and an OS terminal are not supplied.
`node:test` exposes the Workers mock API, not Node's complete test runner.

## Workers APIs and bindings

- `passThroughOnException`, local WorkerEntrypoint/RPC, Cache API and HTMLRewriter
  are unsupported. Scheduled/queue/workflow lifecycles are not simulated locally.
- `cloudflare:workers` is partial. The isolated dispatcher updates a realm-wide
  `env` proxy; direct execution does not populate it. It is not request-local and
  is not populated before the first dispatch. Prefer the Fetch Handler argument.
  DurableObject is a constructor shell, not a local Durable Objects runtime.
- `Request.cf` preserves supplied values; it does not generate Cloudflare metadata.
- [Local KV](kv.md) uses device storage without cloud replication or binding RPC.
- D1, Hyperdrive, R2, Service Bindings, Queue producers and
  [other cloud services](cloudflare-bindings.md) execute remotely through the
  deployed Worker's HTTP handler. They are not local service implementations.
  Local ASSETS is unsupported; use the explicit remote asset policy.

## Native networking

HTTP/1.1 framing, redirects and response parsing run in JavaScript/Wasm. Native
code provides TCP/TLS and WebView lifecycle hooks. Each HTTP request uses a
connection with `Connection: close`; there is no implicit retry after sending.

- HTTPS requires Content-Length or chunked framing. EOF-delimited HTTPS rejects
  because the byte bridge cannot distinguish authenticated closure from truncation.
  Plain HTTP supports EOF framing.
- Trailers are parsed but are not exposed as Fetch response headers. HTTP/2,
  protocol upgrades and CONNECT are unsupported by this HTTP/1.1 transport.
- Socket reads/writes are bounded at 64 KiB; header text is limited to 64 KiB
  across informational/final headers and trailers. Reads follow consumer demand.
- Browser execution retains browser CORS/header/cookie restrictions. Native
  transport does not promise browser-equivalent SameSite or CSRF protection.
- OS termination can stop background work. Physical devices, WebView crash
  recovery and memory pressure require separate validation.

## Document rendering

See [native document rendering](native-rendering-api.md#scope-and-limits) for
navigation, form uploads, redirects, trust and lifecycle restrictions. Browser
Service Worker comparisons include six expected WebKit failures for POST replay
and redirect metadata; iOS uses a different native scheme bridge. Browser results
are not a substitute for iOS/Android validation.
