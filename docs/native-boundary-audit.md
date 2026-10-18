# Web and native transport boundary

HTTP/1.1 runs in the WebView or Dedicated Worker. The native plugin owns TCP/TLS
byte I/O and WebView lifecycle integration. No local HTTP server is started.

## Responsibilities

| Layer                       | Responsibility                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/browser/fetch`          | Fetch policy, request serialization, streaming, redirects, cookies, decompression, cancellation and ownership |
| `src/shared/http-wire`      | Strict HTTP/1.1 response parsing using llhttp 9.3.0 WASM; bounded input; raw headers and bodies               |
| iOS `SocketBridge`          | Network.framework TCP/TLS, OS certificate validation, bounded I/O, close completion and teardown              |
| Android `WorkerSockets`     | Netty TCP/TLS, OS certificate validation, bounded I/O and teardown                                            |
| `src/documents/host.ts`     | Document redirect method/body/header decisions and redirect limits                                            |
| Native document integration | WebView creation, scheme/navigation integration and lifecycle                                                 |

The HTTP transport requests one connection per request with `Connection: close`.
It uses content length when provided and checked, otherwise chunked uploads.
Responses support content length and chunked framing/trailers. Plain HTTP also
supports EOF framing. HTTPS bodies must have explicit HTTP framing: both target
native stacks reported an unnotified TLS shutdown as ordinary EOF in the local
fixture. Consequently an EOF-delimited HTTPS body is rejected even for a clean
TLS shutdown; it cannot be authenticated as complete by this byte bridge. This
is an explicit transport limitation, not a claim that all TLS implementations
lack close-notify inspection. OpenSSL independently rejected the unclean fixture
with `unexpected eof while reading`. Framed responses complete without relying
on a later TLS close signal.
Informational responses precede the final response. Trailers are parsed but are
not added to the Fetch response headers. HTTP/2, protocol upgrades and CONNECT
are not part of this HTTP/1.1 Fetch transport. There is no silent retry through a
second transport after sending a request.

Each socket read/write is bounded at 64 KiB. The parser consumes at most one
socket read at a time; further reads follow consumer demand. Header text is
limited to 64 KiB across informational/final headers and trailers. A native
reset carries a separate `reset` marker: HTTP rejects it, while the Node socket
adapter retains its Workers EOF semantics. Native ownership closes handles even
when a Worker terminates or a page is destroyed without executing JS cleanup.

## Removed native responsibilities

The native HTTP clients and their bridge methods are removed. iOS no longer
depends on AsyncHTTPClient or Swift NIO. Android no longer declares Netty's HTTP
codec; its socket/TLS dependency remains. No new public configuration selects
between old and new HTTP transports.

Document redirect decisions also run in JS. The iOS bridge keeps the navigation
count with its WebView lifecycle, validates the returned local navigation
instruction, cancels the provisional scheme task and performs the native load.
It no longer chooses redirect methods or removes body headers.

Swift/Java source decreased from 1,454 to 904 physical lines (including blank
lines/comments), a reduction of 550 lines. This is a source measurement, not an
IPA/APK saving. The embedded llhttp binary is 54,013 bytes and uses a 128 KiB
initial WASM memory per parser instance; this is not a measurement of total
WebView heap. Its module is compiled once per realm and parser state is separate
per connection. See the [upstream notice](../src/shared/http-wire/NOTICE.md).

## Why these native operations remain

Ordinary WKWebView and Android WebView pages do not expose a general raw TCP/TLS
socket API. Browser Fetch filters headers and manual redirects and applies CORS;
a JS wrapper cannot recover data already filtered by the browser. Native sockets
provide that missing I/O. This is a boundary of the target WebView API, not a
claim that networking is impossible on every Web platform.

Likewise, JS callbacks cannot guarantee resource release after their realm is
destroyed. Native handle ownership, queue bounds and lifecycle cancellation must
remain on the receiving side. Document navigation uses platform WebView hooks;
moving HTTP framing into Web code does not replace those hooks.

References:

- [Fetch filtering](https://fetch.spec.whatwg.org/#concept-filtered-response)
- [Chrome Direct Sockets](https://developer.chrome.com/docs/iwa/direct-sockets) is
  for Isolated Web Apps, not a portable API for these Capacitor WebViews.
- [WKURLSchemeHandler](https://developer.apple.com/documentation/webkit/wkurlschemehandler)
- [Android WebResourceRequest](https://developer.android.com/reference/android/webkit/WebResourceRequest)
- [HTTP/1.1 framing](https://www.rfc-editor.org/rfc/rfc9112.html)

## Verification ownership

`src/shared/http-wire/index.spec.ts` checks fragmented parsing, duplicate headers,
interim responses, body framing, malformed/truncated input and header bounds.
`src/browser/fetch/native-network.spec.ts` checks serialization, raw bytes, reset
handling, ownership and cleanup. Public Fetch and native lifecycle checks remain
in their existing integration suites. The previous rejected parser experiment
is not shipped or retained as an incomplete API.

Historical acceptance records in the Node inventory identify their original
source revisions; they are not evidence for this replacement implementation.

## Local acceptance (2026-10-18)

These results cover this replacement implementation, independently of the
historical inventory certifications. They are local runs, not a remote CI claim.

| Check                                                | Result                    |
| ---------------------------------------------------- | ------------------------- |
| Build and root/demo typechecks                       | Passed                    |
| Unit tests, including parser and transport ownership | 292 passed                |
| Pinned workerd contracts                             | 93 passed                 |
| Chromium/WebKit runtime integration                  | 66 passed                 |
| Packed consumer, Vite/esbuild/raw ESM                | Passed                    |
| Android 16 native network, including local TLS       | 92 passed                 |
| iOS 26.1 native network, including local TLS         | 92 passed                 |
| iOS Hono and Express packed document apps            | 50 each; lifecycle passed |
| Android 16 Hono and Express packed document apps     | 50 each; lifecycle passed |

The final two unit cases and native TLS cases enforce the HTTPS EOF restriction.
The document suites include background/relaunch/update/reinitialization. Native
apps install an actual npm tarball, without source overlays. The local TLS CA is
installed only for the selected simulator and the Android debug test consumer;
production trust configuration is unchanged.
