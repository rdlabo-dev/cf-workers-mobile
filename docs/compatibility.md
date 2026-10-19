# Compatibility and limitations

The target is Cloudflare Workers, not a standalone Node.js process. The Node
profile uses workerd `1.20261012.1`, compatibility date `2026-10-17`, without
additional flags. Other dates and flags are not covered by this profile.
The WebView does not contain workerd or V8; iOS uses its own JavaScript engine.

## Node.js

Whole-Node compatibility is incomplete. Importing a module successfully does not
establish equivalent methods, validation, state, scheduling or engine behavior.

| Area                                              | Behavior and limitations                                                                                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| path, querystring, string_decoder, buffer, timers | Implement the pinned Workers profile. Workers stubs remain stubs; for example, matchesGlob reproduces the pinned rejection.                                                                |
| HTTP and net                                      | In-memory server dispatch; no OS listening server. Outbound TCP/TLS requires the native transport.                                                                                         |
| fs / fs/promises                                  | Read-only embedded virtual files. Writes, FileHandle, watch and full filesystem semantics are unsupported.                                                                                 |
| module                                            | Limited builtin registry; createRequire loads VFS JSON only. Executable modules must be bundled; arbitrary dynamic resolution is unsupported.                                              |
| process, events, console, util / util/types / sys | Incomplete exports or behavior. Engine introspection, call sites and host-object detection are not equivalent to Workers.                                                                  |
| crypto and zlib                                   | Dependency implementations do not cover all Workers exports, algorithms, keys or codecs. Do not assume cryptographic or compression parity.                                                |
| TLS and HTTP internals                            | node:tls is incomplete. \_http_common, \_http_outgoing, \_http_server, \_tls_wrap and \_stream_wrap fail the import audit. Native TLS transport does not imply Node TLS API compatibility. |
| Streams                                           | A packaged fallback supplies byte streams when the host lacks them. Workers tee cancellation reasons and pipeTo abort timing are not fully reproduced.                                     |
| async_hooks                                       | Build-transformed async functions retain scoped stores. Untransformed native async callbacks reject; arbitrary dynamic code and request-origin isolation are not fully supported.          |
| diagnostics_channel                               | Synchronous channel/store contracts are implemented; async propagation depends on the async-hooks limitations.                                                                             |
| worker_threads                                    | Workers stubs and local MessagePort behavior, not Node threads. Trusted-event branding, host-object serialization and global identity differ.                                              |
| DNS                                               | DNS-over-HTTPS implementation; synthetic Service Binding/Hyperdrive address overrides are not implemented.                                                                                 |
| Other modules                                     | Implementations and shared contracts exist, but whole-module acceptance remains outstanding. Namespace equality alone is insufficient.                                                     |

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

Remote HTML is rendered at the app-local origin (`capacitor://localhost` on iOS,
normally `https://localhost` on Android). Remote execution keeps server code and
cloud services on the Worker; it does not turn the WebView into that site's origin
or supply every browser authentication feature. Check hydration and interactive
controls, not only a successful HTML response.

### Application integration limits

| Feature                                        | Current boundary                                                                                                                                                                      | Integration guidance                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Better Auth with an inferred client base URL   | The pinned flare-stack-blog application fails client initialization on iOS because Better Auth rejects `capacitor://localhost`. Android's HTTP(S) origin does not hit this rejection. | An explicit HTTPS authentication endpoint initializes the client, but its full login/cookie flow has not been validated here. Do not assume that setting alone completes migration. See the [reproduction](../demo/tests/upstream/flare-stack-blog/README.md).                                                                                                                                                    |
| Passkeys / WebAuthn and PRF                    | Native passkey registration in pknotes fails on both tested platforms. Chromium's virtual authenticator acceptance does not establish native support.                                 | Native credential integration, app/domain association and PRF availability need separate validation. Remote rendering cannot bypass relying-party origin checks. Native support is deferred, not proven technically impossible. See the [authentication boundary](../demo/tests/upstream/pknotes/README.md).                                                                                                      |
| Void React Pages 1.1.11 on iOS                 | The client router rejects the native `capacitor:` scheme; initial SSR output does not establish working navigation.                                                                   | Our [upstream fix](https://github.com/voidzero-dev/void/pull/485) has been merged and its patched client passed simulator/emulator checks. The fix is included in [v1.1.12](https://github.com/voidzero-dev/void/releases/tag/v1.1.12); use 1.1.12 or newer. Published-artifact verification remains separate from the patched-client evidence; see the [Void integration limits](void.md#verification-boundary). |
| External-browser OAuth                         | The example verifies a local test issuer, PKCE, callback handling and session exchange. Real provider policies, refresh-token storage and cold-start resume are not covered.          | Use the provider's native SDK where available. System-browser cookies are not automatically shared with the WebView. See the [authentication example](../demo/authentication/README.md).                                                                                                                                                                                                                          |
| Analytics Engine and other cloud-only services | Analytics Engine executes in Cloudflare; there is no local dataset implementation. Counterscale's live scenario requires a provisioned account, events and an analytics read token.   | Keep privileged tokens on the backend and authenticate device requests. The default CI authentication scenario does not exercise live analytics. See [Counterscale setup](../demo/tests/upstream/counterscale/README.md).                                                                                                                                                                                         |
| Image optimization and device performance      | The OpenNext fixture covers remote IMAGES handling in local workerd, not a deployed Images service. Performance samples use Debug simulators/emulators.                               | Verify production image configuration and measure startup and memory on physical devices before making performance claims. See [OpenNext gaps](opennext.md#current-gaps).                                                                                                                                                                                                                                         |

Pinned third-party fixtures exercise specific user flows without editing their
application source; they are not certification of every feature or future version.
Most use local workerd behind HTTPS as the remote backend. Live Analytics Engine
is an explicitly configured exception. See the [scenario scopes](../demo/tests/README.md#application-acceptance)
before relying on a result for a production integration.

See [native document rendering](native-rendering-api.md#scope-and-limits) for
navigation, form uploads, redirects, trust and lifecycle restrictions. Browser
Service Worker comparisons include six expected WebKit failures for POST replay
and redirect metadata; iOS uses a different native scheme bridge. Browser results
are not a substitute for iOS/Android validation.
