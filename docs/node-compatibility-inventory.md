# Workers Node.js compatibility inventory

## Implementation status

**`node:path`, `node:querystring`, and `node:string_decoder` are Complete at commit `b1a58d1`.** Their local contracts, native verification, manager/independent reviews and [remote CI](https://github.com/rdlabo-dev/capacitor-workers/actions/runs/38999137150) have passed. Node/Web global installation and native Fetch transport are **Complete at `13261ce`** for the pinned profile below: manager/independent reviews and [CI passed](https://github.com/rdlabo-dev/capacitor-workers/actions/runs/39007518228). The remaining **`node:http`, `cloudflare:node` and `node:net` units are Complete at `35316ae`**, including public TCP dispatch and both native transports. Their [CI run](https://github.com/rdlabo-dev/capacitor-workers/actions/runs/39017343994) and acceptance evidence are recorded below. See the [merge and release acceptance gate](../CONTRIBUTING.md#acceptance-gate).

The status column describes this repository. **Class A/B/C/D/U/S describes feasibility only.** Existing PoC implementations are completion work, not release-ready exceptions.

| Status              | Meaning                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Complete**        | The whole declared module/API unit satisfies the acceptance gate, including its export audit, contracts, integrations, native verification and reviews. |
| **Unverified**      | A dependency polyfill or host API may provide behavior, but Workers parity has not been established. Not eligible for merge or release.                 |
| **Not implemented** | No implementation of the required behavior exists. A placeholder or empty export is not an implementation.                                              |
| **Out of scope**    | Not a local Node compatibility feature.                                                                                                                 |

| Module / feature                       | Current status                    | Implemented scope and remaining work                                                                                                                                                                          |
| -------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node:path`                            | **Complete**                      | [Module contract](../src/compat/path/index.spec.ts): POSIX, win32, relative resolution and the actual Workers `matchesGlob` rejection. Accepted at `b1a58d1`; remote CI passed.                               |
| `node:querystring`                     | **Complete**                      | [Module contract](../src/compat/querystring/index.spec.ts), including all seven exports. Accepted at `b1a58d1`; remote CI passed.                                                                             |
| `node:string_decoder`                  | **Complete**                      | [Module contract](../src/compat/string-decoder/index.spec.ts), including constructor, prototype, encodings and public state. Accepted at `b1a58d1`; remote CI passed.                                         |
| `node:http` / Cloudflare Node bridge | **Complete** | Export/prototype audits, HTTP client/server contracts and TCP dispatch through public `net.Server` and both Cloudflare helpers. Accepted at `35316ae`. |
| `node:net` | **Complete** | [Module contract](../src/compat/net/index.spec.ts): all 17 named exports, logical ports, Socket/Server behavior and native TCP in direct/Worker execution. Accepted at `35316ae`. |
| Node global injection                  | **Complete**                      | Pre-evaluation Node globals, owned Web globals and native Fetch passed shared/native contracts, packed-consumer gates, reviews and CI at 13261ce. Module-scope extensions require configured/lazy loading.    |
| `node:fs` / `node:fs/promises`         | **Unverified**                    | Read-only VFS with `workerFiles` bundler embedding; verified against a re-bundled OpenNext handler locally. Write APIs, FileHandle, watch and realpath edge cases are unimplemented. |
| `node:module` / `node:stream/web` / `node:util` | **Unverified**      | Scoped shims: `createRequire` (VFS `.json` only), platform stream constructors, util polyfill + `TextEncoder`/`TextDecoder`. Verified transitively by the OpenNext smoke. |
| `node:async_hooks` / AsyncLocalStorage | **Unverified**                    | Scoped implementation at `src/compat/async-hooks/index.ts` with a 14-case contract compared against pinned workerd. Synchronous scopes, enterWith/disable, bind/snapshot, sticky single-context await propagation and AsyncResource boundaries pass locally; settle-restore and interleaved-context isolation are declared unsupported. A re-bundled OpenNext (Next 15.5) handler rendered static and dynamic routes locally with this approximation; full Workers parity is not established. |
| `node:buffer` | **Complete** | Whole-module implementation and [Buffer acceptance](#buffer-acceptance) passed [remote CI](https://github.com/rdlabo-dev/workers-capacitor/actions/runs/39084878630) at `e90bc50` (PR #20). |
| `node:timers` / `node:timers/promises` | **Complete** | Whole-module implementation and shared 30-group contract in `src/compat/timers/`. [Acceptance](#timers-acceptance) and [remote CI](https://github.com/rdlabo-dev/workers-capacitor/actions/runs/39093405066) passed at `c5fb8a4`; merged as `400d022`. |
| `node:url` | **Unverified (CI pending)** | Whole-module implementation, upstream vectors and 19 shared contract groups in `src/compat/url/`. See [URL acceptance](#url-acceptance). |
| `node:os`, `node:tty`, `node:wasi`, `node:punycode` | **Unverified (acceptance pending)** | Module-owned implementations and contracts pass workerd, browser and both native platforms. Review and remote CI remain pending. |
| `node:constants`, `node:v8`, `node:http2`, `node:vm` | **Unverified (acceptance pending)** | Whole pinned Workers surfaces implemented with adjacent contracts. Includes Workers stub semantics and argument validation; this does not enable V8 access or HTTP/2 networking. Workerd, browser, packed-consumer and both native validations pass at `719b8fe`; review and remote CI remain pending. |
| `node:child_process`, `node:cluster`, `node:dgram`, `node:domain`, `node:inspector` (+ promises), `node:readline` (+ promises) | **Unverified (acceptance pending)** | Pinned production behavior implemented with adjacent contracts. Workerd, browser, packed-consumer and both native checks pass at `5169e5e`; review and remote CI remain pending. |
| `node:repl`, `node:sqlite`, `node:test` | **Unverified (acceptance pending)** | Pinned REPL/SQLite stub behavior and Workers MockTracker API implemented with adjacent contracts. Local workerd/browser/package/native checks pass at `052647f`; independent review and remote CI remain pending. `node:test` is the Workers mock API, not Node's entire test runner. |
| Other module families                  | **Unverified or Not implemented** | See each row below. Other module families are not certified Complete.                                                                                                                                         |

## Remaining implementation sequence

The scope is **all remaining Node compatibility modules**, including existing
PoC shims and dependency polyfills. The recent seventeen families are not the
completion boundary. No new PR or release is created merely because a subset
passes. Existing Complete units retain their acceptance records; changing shared
dependencies requires their regression checks.

The fixed runtime audit enumerates **70 builtins/subpaths and 1,597 namespace
export entries**. The whole-surface browser audit now checks every entry through
the public esbuild plugin. **40 entries have import/export gaps in both Chromium
and WebKit.** The other 30 only have matching export names, not automatic
behavioral acceptance.

See the [complete 70-entry matrix and dependency order](node-compatibility-surface.md).
Run `npm run test:node-inventory` from `demo` after building the library.
Raw results are written to `demo/artifacts/node-inventory/`. Missing imports
remain visible, and newly failing modules outside the recorded debt fail the audit.

## Scope and evidence

Inventory date: 2026-10-17. Inventory starting point: `b58b543` (PR #16). The initial inventory used `2f10c95`; the first three module certifications now reference `b1a58d1`. The earlier global/transport acceptance references `13261ce`; its native suites exercised the implementation saved in `7366156`, with the subsequent constructor-ownership guard verified by unit tests, browser integration and CI.
This inventory separates implementation feasibility from verified support. Verified units and their fixed baseline are recorded in the implementation status and acceptance sections below.
It covers every category and non-functional stub in the [Workers Node.js overview](https://developers.cloudflare.com/workers/runtime-apis/nodejs/), splitting mixed categories into API families below. It is not an exhaustive export/signature manifest of Node.js itself.

The target is Workers semantics, including its unsupported operations. A Node API implemented in native code by workerd does not necessarily require native code in Capacitor. Conversely, a browser polyfill being importable does not establish compatibility.

Sources describe current Workers behavior. For executable follow-up, use a fixed baseline: compatibility date `2026-10-17`, no extra flags, installed workerd `1.20261012.1` and Wrangler `4.151.0`. The first-batch contracts below run against this configuration. Older compatibility dates and explicit enable/disable flags require separate profiles. The overview currently enables Node compatibility by default for dates from `2026-08-04`; do not assume every profile needs an added `nodejs_compat` flag.

Classification is an engineering assessment from documented behavior and current code. Evidence for implemented profiles is recorded separately below. Unknown export details remain explicit follow-up items rather than being silently marked supported.

### Web/native boundary replacement

HTTP serialization/parsing and document redirect policy now run in Web code.
Native code owns TCP/TLS and WebView lifecycle operations. This replacement
removes the previous native HTTP clients rather than retaining an unreleased
compatibility path. See the [boundary and current local acceptance](native-boundary-audit.md)
for implementation responsibilities, verification, and the explicit rejection of
EOF-delimited HTTPS bodies. The acceptance records below retain their historical
revisions; they do not certify this replacement by themselves.

### Global, transport and Node bridge acceptance

The development branch now includes owned Request/Response/Headers and
structured-clone adapters, native byte transports, Workers Fetch policy and Node
HTTP client/server behavior. The fixed-workerd comparison includes real loopback
HTTP rather than a Node-fetch proxy that would hide redirect/decompression
behavior. Node HTTP intentionally preserves the pinned Workers behavior, including
its joined Cookie header values and unsupported options.

The earlier `13261ce` acceptance included 217 unit tests, 42 Chromium/WebKit runtime tests,
280 runtime checks per native platform, and 86 native network checks per platform
(including valid TLS, untrusted certificates and hostname mismatches).
Manager and independent acceptance reviews passed, followed by the complete remote CI run at `13261ce`.
Encoding and Abort contracts now run against pinned workerd and both WebViews.
The AbortSignal timeout conversion difference is adapted without replacing native
signal branding. Both platforms passed the fresh npm-tarball Hono and Express acceptance suites, including background/relaunch/update/reinitialization.
The reproducible network procedure is in [the test guide](../demo/tests/README.md#native-outbound-http-contracts).

The TCP dependency is now complete at `35316ae`. `node:net` ports share ownership
with HTTP, and both `handleAsNodeConnection` and `connectHandler` dispatch to a
public `net.Server`. No registry injection or OS listening server substitutes for
that path. The implementation ports the pinned workerd API; native code supplies
bounded TCP byte I/O only. iOS uses Network.framework and Android reuses Netty.
A modern `readable-stream` dependency supplies Socket lifecycle state; this does
not certify the entire `node:stream` module.

Final acceptance at `35316ae`:

- 229 unit tests, 92 pinned-workerd tests and 3 online TLS tests passed.
- 42 Chromium/WebKit runtime tests and 7 build-unit / 30 Vite/esbuild tests passed.
- The installed tarball passed 162 common contracts, 26 direct / 22 isolated
  cases, 10 build-tool/raw ESM cases and 2 cold Vite development cases.
- iOS 26.1 and Android 16 each passed 298 runtime checks, including 134 Node
  contract groups across direct and Dedicated Worker execution, with no exclusions.
- Each native platform passed 88 network checks, including both TCP helpers,
  half-close, onread buffers, vectored writes, abort/timeout, paused unread data,
  FIN/reset before and after data delivery, and TLS certificate validation.
- Fresh packed consumers passed 50 Hono and 50 Express checks on each platform,
  including background/relaunch/update/reinitialization.
- Manager and independent acceptance reviews have no outstanding required changes.
  [All five CI jobs passed](https://github.com/rdlabo-dev/capacitor-workers/actions/runs/39017343994).

Native reports are generated under the consumer's `artifacts/network/` and
`demo/artifacts/node-light/`; the reproducible commands are in the test guide.

Worker modules that use Workers Web API extensions at module scope must use the
configured plugin entry (or a lazy `loadDirect` source); static imports execute
before runtime initialization. This initialization condition is documented in
[the README](../README.md#execution-preference) and exercised through both Vite
and esbuild in direct and Dedicated Worker execution. No **In progress** row
is promoted solely because the currently written tests pass.

### Global API test ownership

Global installation and API compatibility are separate test responsibilities.
Each API owns its behavior contract; environment runners execute those contracts
and report API-specific test names. `globals` verifies the installation lifecycle.

| Responsibility | Owning tests |
| --- | --- |
| Fetch transport and Workers HTTP policy | [fetch/index.spec.ts](../src/compat/fetch/index.spec.ts), [fetch/policy.spec.ts](../src/compat/fetch/policy.spec.ts) |
| Headers | [headers/index.spec.ts](../src/compat/headers/index.spec.ts) |
| Request | [request/index.spec.ts](../src/compat/request/index.spec.ts) |
| Response and installed body decoding | [response/index.spec.ts](../src/compat/response/index.spec.ts), [response/installation.spec.ts](../src/compat/response/installation.spec.ts) |
| AbortController / AbortSignal and timeout installation | [abort/index.spec.ts](../src/compat/abort/index.spec.ts), [abort/installation.spec.ts](../src/compat/abort/installation.spec.ts) |
| TextEncoder / TextDecoder | [encoding/index.spec.ts](../src/compat/encoding/index.spec.ts) |
| structuredClone | [structured-clone/index.spec.ts](../src/compat/structured-clone/index.spec.ts) |
| setImmediate / clearImmediate | [immediate/index.spec.ts](../src/compat/immediate/index.spec.ts) |
| Global installation, ownership and restoration | [globals/index.spec.ts](../src/compat/globals/index.spec.ts), [globals/web.spec.ts](../src/compat/globals/web.spec.ts) |

### Test organization follow-up (2026-10-17)

The API-specific test organization above preserves the accepted production
implementations and shared API contracts from `074f031`. The moved AbortSignal
and Response tests retain their original installation path and assertions.
Complete statuses, certification revisions and earlier native evidence remain
unchanged; this follow-up does not recertify or expand any API unit.

Local revalidation passed: root/demo type checks and build, 235 unit tests,
93 workerd tests, 66 Chromium/WebKit runtime tests, and the packed-consumer suite
(162 common cases, 26 direct / 22 isolated, 10 build-tool/raw ESM, 2 cold Vite dev
and 2 execution-preference cases). The higher runner counts reflect API-level
test separation; they do not imply additional supported APIs. Manager and
independent reviews passed after restoring the original overlapping-owner
AbortSignal integration test. This follow-up has no new native or remote CI claim.

## Classification

| Code | Meaning                                   | Boundary                                                                                                                                                                         |
| ---- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | JavaScript implementation                 | Module replacement using JS and existing Web APIs; no additional Capacitor plugin required.                                                                                      |
| B    | Global installation or wrapping           | JS implementation plus pre-evaluation injection, global adapters or lifecycle integration. Prefer scoped bindings over changing shared globals.                                  |
| C    | Native transport required                 | With no remote relay and no alternate JS engine, the required I/O is unavailable to normal WebView JavaScript. A Capacitor plugin must expose it.                                |
| D    | Unavailable under the stated architecture | Ordinary module/global replacement and asynchronous Capacitor calls cannot supply the required engine capability. This is not a claim of impossibility under every architecture. |
| U    | Unresolved                                | A concrete source audit or experiment is required. Do not equate unknown with impossible.                                                                                        |
| S    | Workers stub or unsupported operation     | Implement Workers' import/call behavior in JS. This is a target behavior, not a missing real OS implementation.                                                                  |

A/B/C can coexist within a module. S is an additional target-semantics label, normally implemented through A. Wasm is **not** included in the phrase “JS only”: any selected Wasm dependency needs an explicit decision, initialization plan and bundle cost. Network access and bundling are also stated separately.

## Inventory: computation and modules

The [official overview](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) establishes the module scope. A classifications below describe an implementation route, not an assertion that an existing polyfill already covers every overload or edge case.

| Implementation status | Category             | API family                                                                         | Class                      | Implementation boundary / remaining check                                                                                                                                                            |
| --------------------- | -------------------- | ---------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unverified            | Assertion testing    | `assert`, `assert/strict`, equality, throws/rejects                                | A                          | JS comparison and exception handling. Deep comparison involving engine-only inspection is U; test cross-realm values and error shapes.                                                               |
| **Complete** | Buffer | Entire pinned export/static/prototype surface, Blob/File and transcode | A | [Whole-module acceptance](#buffer-acceptance); PR #20 remote CI passed.                                                                                                                             |
| **Complete**          | Buffer globals       | unqualified `Buffer`                                                               | B                          | Inject before application/dependency evaluation; imports and global must use the same implementation.                                                                                                |
| Unverified            | Events               | `EventEmitter`, `once`, `on`, listener bookkeeping                                 | A                          | Preserve ordering, error events, cancellation and iterator cleanup.                                                                                                                                  |
| Not implemented       | Events + context     | `EventEmitterAsyncResource` where exposed                                          | U                          | Depends on the async context decision; do not claim parity from EventEmitter alone.                                                                                                                  |
| **Complete**          | Path                 | POSIX and win32 operations, relative resolution and baseline matchesGlob rejection | A                          | Full module candidate verified locally; remote CI passed at `b1a58d1`. See the [contract](../src/compat/path/index.spec.ts).                                                                         |
| **Complete**          | Path                 | `win32`                                                                            | A                          | Implemented with the pinned Workers module, including the subpath export; accepted at `b1a58d1`; remote CI passed.                                                                                   |
| **Complete**          | Path                 | cwd-dependent `resolve`/`relative`                                                 | A                          | Matches the pinned Workers virtual root `/`; accepted at `b1a58d1`; remote CI passed.                                                                                                                |
| **Complete**          | Path                 | `matchesGlob`                                                                      | A/S                        | Reproduces the pinned Workers throwing behavior with a passing contract; remote CI passed at `b1a58d1`.                                                                                              |
| Unverified            | URL                  | `URL`, `URLSearchParams`, legacy parse/format/resolve, file URL conversion         | A                          | Whole-module JS adapter, pinned Ada IDNA data and shared contract. See [URL acceptance](#url-acceptance).                                                                                                                         |
| **Complete**          | Query strings        | parse/stringify/escape/unescape                                                    | A                          | All seven exports covered by the expanded module contract; remote CI passed at `b1a58d1`.                                                                                                            |
| Unverified            | Punycode             | encode/decode, domain conversion helpers                                           | A                          | JS algorithm; preserve deprecated-module availability for the selected profile.                                                                                                                      |
| **Complete**          | String decoder       | `StringDecoder` constructor and write/end/text                                     | A                          | Constructor, methods, encoding/state and reuse contracts verified locally; remote CI passed at `b1a58d1`.                                                                                            |
| **Complete**          | String decoder       | internal methods/state: `text`, `lastChar`, `lastNeed`, `lastTotal`                | A                          | Included in the expanded module contract; remote CI passed at `b1a58d1`.                                                                                                                             |
| Unverified            | Streams              | Readable/Writable/Duplex/Transform/PassThrough                                     | A                          | JS state machines; backpressure, destroy, error and event order.                                                                                                                                     |
| Unverified            | Stream helpers       | pipeline/finished, async iterators, promises, Web conversions                      | A                          | Web Streams and JS adaptation; abort and ownership must propagate.                                                                                                                                   |
| Unverified            | Utilities            | promisify/callbackify, format, MIME parsing, parseArgs where exposed               | A                          | Pure JS adapters; audit actual exports for the pinned profile.                                                                                                                                       |
| Unverified            | Utilities inspection | inspect, deep comparisons, `util.types`                                            | A/U                        | Ordinary formatting/type tests have JS routes; exact hidden-state inspection and cross-realm brands need per-method evaluation. Do not invent a successful result for an inaccessible internal slot. |
| Unverified            | Compression          | gzip/gunzip, deflate/inflate, raw variants, unzip                                  | A                          | JS codecs can provide synchronous and asynchronous facades. CompressionStream alone does not cover sync/options/flush semantics.                                                                     |
| Unverified            | Compression          | Brotli compress/decompress and stream forms                                        | A candidate / U dependency | Computation does not inherently need a plugin. Select and test JS implementation; a Wasm codec is a distinct option, not an already-proven JS solution.                                              |
| Unverified            | Compression          | Additional exports beyond documented codecs                                        | U                          | Extract from pinned workerd before promising newer Node codecs.                                                                                                                                      |
| Not implemented       | Test runner          | `mock`, MockTracker function/method/getter/setter tracking                         | A                          | Workers subset, not a complete CLI runner; inspect supported exports.                                                                                                                                |
| Not implemented       | Test runner          | Mock timers                                                                        | S                          | Documented as absent in Workers; match its failure behavior.                                                                                                                                         |
| Not implemented       | Module               | builtinModules, isBuiltin, getBuiltinModule-style registry                         | A + build                  | Generate one registry for Vite/esbuild and runtime lookup. Confirm which APIs live on `module` vs `process`.                                                                                         |
| Not implemented       | Module               | createRequire, resolution, dynamic module loading/hooks                            | U                          | Determine Workers' actual supported subset first. Statically bundled dependencies can use build-time resolution; arbitrary unbundled Node resolution must not be assumed.                            |

The documentation's unsupported type-inspection list is not sufficient for this
fixed profile. A reproducible [engine-boundary probe](../demo/tests/experiments/node-compat/engine-boundaries.test.mjs)
shows that `util.types.isProxy()` returns true for both ordinary and revoked
proxies without invoking traps, and false for the original target. The pinned
[workerd util implementation](https://github.com/cloudflare/workerd/blob/5358e3d337336eaf696a48bc1563d808b10feba5/src/workerd/api/node/util.h)
exposes engine type inspection. This API is **not S** on this profile. Ordinary
Web JavaScript has no general, non-observable proxy inspection primitive;
wrapping future Proxy constructors cannot recognize pre-existing/cross-realm
proxies. The whole `util/types` unit remains uncertified while this boundary is
unresolved. The same probe confirms native async continuation isolation in
workerd and rejects `new sqlite.DatabaseSync(':memory:')` with `TypeError:
Illegal constructor`; neither outcome certifies a local implementation.

[Zlib documentation](https://developers.cloudflare.com/workers/runtime-apis/nodejs/zlib/) identifies the codec families; it does not establish that the repository's browser dependency implements all of them. [Test documentation](https://developers.cloudflare.com/workers/runtime-apis/nodejs/test/) defines the MockTracker scope.

## Inventory: crypto

[Workers crypto documentation](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/) is the reference for supported algorithms and exceptions. Class A here means a computational route exists; a secure, complete implementation has not been selected or verified.

| Implementation status | API family                                                                            | Class                          | Boundary / acceptance decision                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unverified            | randomBytes, randomFill, randomUUID, randomInt                                        | A                              | Use platform cryptographic randomness, handle Web Crypto chunk limits and unbiased integer sampling. Never substitute Math.random.                                                                                         |
| Unverified            | Hash/Hmac, createHash/createHmac, update/digest                                       | A                              | JS incremental algorithms for sync APIs; Web Crypto where its asynchronous shape fits. Verify all supported algorithms.                                                                                                    |
| Unverified            | Cipher/Decipher, signing/verification, KDFs, key agreement                            | A candidate / U implementation | JS or explicit Wasm implementation for sync and streaming operations; algorithm, padding, encoding and failure behavior require vectors. Native acceleration is optional, not inherently necessary.                        |
| Unverified            | generateKey/generateKeyPair, sync variants, KeyObject, import/export, X509Certificate | A candidate / U implementation | Key generation and ASN.1/PEM/DER parsing can be computation; exact accepted forms, conversion and opaque-key interoperability require investigation. A Promise-returning plugin cannot directly replace a synchronous API. |
| Unverified            | webcrypto/subtle and CryptoKey integration                                            | A/U                            | Use existing Web Crypto where algorithms and key representations match. Browser algorithm gaps and non-extractable keys need individual decisions.                                                                         |
| Unverified            | timingSafeEqual and timing-sensitive guarantees                                       | U                              | Functional equality is easy; a constant-time guarantee in JS/JIT is not established. Do not relabel as supported after only output tests.                                                                                  |
| Unverified            | Documented unsupported algorithms / FIPS controls                                     | S                              | Preserve Workers restrictions; no device FIPS setting or additional OS service is required to reproduce rejection.                                                                                                         |

## Inventory: runtime and globals

| Implementation status | Category               | API family                                                                              | Class                                                | Boundary / remaining check                                                                                                                                                                                           |
| --------------------- | ---------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Complete**          | Globals           | global alias, Buffer, process                                     | B                                                    | Prefer build injection or dedicated runtime globals. `window` is not present in a Dedicated Worker.                                                                                                                                      |
| **Complete**          | Globals           | fetch, Request/Response/Headers, encoding, abort, structuredClone | A/B/U                                                | Reuse platform objects where compatible; record Workers extensions, forbidden mutation and cross-realm behavior separately. Node inventory does not certify all Workers Web APIs.                                                        |
| Unverified            | Web Crypto        | crypto, SubtleCrypto                                              | A/U                                                  | See crypto table. Standard object availability is not algorithm parity.                                                                                                                                                                  |
| Unverified            | Web Streams       | Readable/Writable/TransformStream, readers, controllers           | A/U                                                  | Native Web APIs or JS polyfills; BYOB, transfer and host-brand interoperability need tests.                                                                                                                                              |
| Unverified            | Process           | env, platform/features/version-like values                        | A+B                                                  | Virtual runtime state, including value coercion and named-import identity. Build-machine env and server secrets must not be copied automatically.                                                                                        |
| Unverified            | Process           | nextTick                                                          | A+B                                                  | Workers uses queueMicrotask; preserve callback arguments and failure handling.                                                                                                                                                           |
| Unverified            | Process           | stdin/stdout/stderr                                               | A+B                                                  | Virtual streams and logging adapter, not OS file descriptors.                                                                                                                                                                            |
| Not implemented       | Process           | cwd/chdir                                                         | A                                                    | Shared virtual cwd; validate against the virtual FS.                                                                                                                                                                                     |
| Unverified            | Process           | hrtime, uptime and time-derived values                            | A/U                                                  | Implement documented compatibility behavior; native precision and matching timestamps are not the goal. Other process-v2 exports need baseline inspection.                                                                               |
| Unverified            | Process           | exit, abort, fatal errors / runtime termination                   | U; D for uninstrumented direct execution             | Throwing an exception is catchable and is not proof of termination semantics. Inspect Workers behavior. Worker-host termination may cover isolated mode; an ordinary plugin cannot stop arbitrary main-realm JS while preserving the UI. |
| Complete              | Timers            | setTimeout/Interval/Immediate, clear variants, promises           | A+B                                                  | Whole-module Web implementation with compatible handles, cancellation, Promise helpers and scheduler. See [timers acceptance](#timers-acceptance). Background OS suspension remains an execution limit.                                                          |
| Unverified            | Console           | log/info/warn/error, format, Console streams, groups/timers       | A+B                                                  | Capture original sinks to prevent recursion; decide which methods require global installation.                                                                                                                                           |
| Unverified            | Errors            | classes, codes, causes, validation                                | A                                                    | JS construction and validation; don't rely on host-specific message text accidentally.                                                                                                                                                   |
| Unverified            | Errors            | captureStackTrace, structured stack formatting and exact stacks   | U                                                    | Browser engines differ. Exact V8 frames/internal hooks are D without engine support; determine whether required Workers exports actually expose them.                                                                                    |
| Unverified            | OS                | constants and Workers virtual values                              | A/U                                                  | Inspect the Workers subset. Device CPU/network/process information is not automatically the right value. No Device plugin dependency assumed.                                                                                            |
| Unverified            | Performance hooks | now, marks/measures, entry lists, observers                       | A/U                                                  | Web Performance plus JS where semantics permit; inspect the actual Workers subset and timer restrictions.                                                                                                                                |
| Unverified            | Performance hooks | GC/heap/event-loop internal observations                          | U → D if genuinely required                          | Ordinary plugin calls do not expose the WebView engine's internal observations. If Workers stubs these, classify S instead.                                                                                                              |
| Not implemented       | Debugger          | Workers Chrome DevTools integration                               | D for identical engine integration; separate tooling | Use platform debugging for local development. Protocol/tooling parity is not supplied by a runtime JS polyfill, especially on iOS JavaScriptCore.                                                                                        |

[Process documentation](https://developers.cloudflare.com/workers/runtime-apis/nodejs/process/) describes virtual process behavior. [Timers documentation](https://developers.cloudflare.com/workers/runtime-apis/nodejs/timers/) defines the scheduling surface. Claims about engine-internal obstacles are architectural assessments, not reported native test results.

## Inventory: async context and diagnostics

[AsyncLocalStorage documentation](https://developers.cloudflare.com/workers/runtime-apis/nodejs/asynclocalstorage/) requires context to survive asynchronous work. A scoped implementation now exists at `src/compat/async-hooks/index.ts` with [its module contract](../src/compat/async-hooks/index.spec.ts) compared against pinned workerd in `demo/tests/workers/node-compat.test.ts`. The pinned workerd baseline itself does not implement `enterWith()`, `disable()`, or `AsyncResource` constructor-type/async-id surfaces; those rows are declared unsupported for the workers profile.

| Implementation status | API / behavior                                                                       | Class                                                   | Decision                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implemented (scoped)  | ALS run/getStore/exit within synchronous callbacks                                   | A                                                       | Contract-verified locally and against workerd; enterWith/disable additionally pass locally where workerd itself is unimplemented.                                                            |
| Implemented (scoped)  | ALS static bind/snapshot; AsyncResource bind/runInAsyncScope                         | A for explicit synchronous boundary / U for descendants | Contract-verified. AsyncResource meta (type/emitDestroy/async ids) is a local extension beyond the workerd surface.                                                                          |
| Implemented (scoped)  | ALS across awaits via "sticky" context (async run/exit leave the context installed until overwritten; patched Promise.then/timers/microtasks/setImmediate, MessageChannel ports and ReadableStream/WritableStream callbacks capture the context at schedule/construction) | Approximation | Worker realms only: patching the WebView document's MessageChannel breaks the fetch adapter, so direct-mode SSR lacks async propagation. Covers serialized single-request flows in an isolated Worker; verified locally against a re-bundled OpenNext handler (static + dynamic SSR routes returned 200). Divergence: post-settle getStore returns the stale store (`settleRestore` unsupported). |
| Not implemented       | ALS across arbitrary native async/await, concurrent interleaved contexts and unhandled rejection | D for global monkey-patching alone                      | `await` bypasses patched Promise.then in V8/JSC, so continuation capture cannot see interleaved contexts. The contract case `concurrentIsolation` is declared unsupported for the local implementation. Normal Capacitor calls do not add an engine hook. |
| Not implemented       | ALS with whole-program async transformation or a supported host context primitive    | U                                                       | Prototype including dependencies, dynamic import, native promises, nesting, cancellation and unhandled rejection. This changes build/runtime assumptions and is not a completed solution. |
| Not implemented       | Remaining async_hooks exports                                                        | U/S                                                     | Extract Workers exports first; Node hook APIs must not be inferred from the ALS module name.                                                                                              |
| Not implemented       | diagnostics_channel channel/hasSubscribers/subscribe/unsubscribe/publish             | A                                                       | Per-runtime registry and synchronous ordered delivery.                                                                                                                                    |
| Not implemented       | diagnostics_channel bindStore/runStores/tracingChannel context propagation           | U                                                       | Depends on ALS result; ordinary event publication does not establish context parity.                                                                                                      |
| Out of scope          | Diagnostic forwarding to Tail Workers                                                | Outside local Node runtime scope                        | A cloud service integration, not recreated by the local channel implementation. No implicit cloud connection.                                                                             |

See [Diagnostics Channel](https://developers.cloudflare.com/workers/runtime-apis/nodejs/diagnostics-channel/) for the boundary between local channels and Tail Workers.

## Inventory: filesystem and network

| Implementation status | Category               | API family                                                                              | Class                                                | Boundary / remaining check                                                                                                                                                                                           |
| --------------------- | ---------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Not implemented       | FS                     | read/write/open/close, metadata, directories, links, sync/callback/promises, FileHandle | A candidate                                          | In-memory virtual FS; inspect Workers-supported operations and error codes, file descriptor lifetime and request isolation. No device Filesystem plugin inherently required.                                         |
| Implemented (scoped)  | FS                     | `/bundle` files                                                                         | A + build                                            | Read-only in-memory VFS at `src/compat/fs` (`readFileSync`/`readdirSync`/`existsSync`/`statSync`/`lstatSync`/`realpathSync` + `fs/promises` subset), populated by the `workerFiles` bundler option. Verified against an OpenNext handler. Writes, FileHandle, descriptors and watch remain unimplemented. |
| Not implemented       | FS                     | `/tmp`, `/dev/null`, `/dev/zero`, `/dev/full`, `/dev/random`                            | A                                                    | Virtual devices and secure random source. Match Workers' lifetime and permission rules; do not introduce persistence.                                                                                                |
| Not implemented       | FS                     | watch, permissions/ownership and other host-like operations                             | U/S                                                  | Establish which operations Workers implements, ignores or rejects. Never infer mobile filesystem behavior from API names.                                                                                            |
| **Complete**       | HTTP receiving         | Server, IncomingMessage, ServerResponse, createServer, listen/close                     | A                                                    | Fetch-handler adaptation with an in-memory server registry. No network listener.                                                                                                                                     |
| **Complete**       | Cloudflare Node bridge | httpServerHandler, handleAsNodeRequest, connectHandler, handleAsNodeConnection          | A                                                    | HTTP and TCP dispatch pass through the public Server/Socket APIs, including both TCP helpers. Accepted at 35316ae.                                                                                          |
| **Complete** | HTTP sending | `node:http` request/get, ClientRequest, response stream, abort | A over native transport | Shared real-network contracts on workerd and both native transports; accepted at 35316ae. |
| Unverified | HTTPS module | `node:https` facade and exports | A over native transport | Native HTTPS transport is tested; the separate Node module has not been certified. |
| **Complete**          | HTTP/HTTPS transport   | unrestricted cross-origin responses, controlled cookies/headers, redirects              | C for required behavior unavailable to WebView fetch | Native streaming byte transports and Workers Fetch policy pass 86 checks per platform; native packed-consumer, review and CI gates passed at 13261ce. Browser fallback retains CORS restrictions.                    |
| Not implemented       | DNS                    | resolve4/6 and other documented resolve variants, promises                              | A over DoH; C if browser transport blocks it         | Implement Workers' DNS-over-HTTPS route, subject to actual CORS/connectivity. No OS resolver is inherently necessary.                                                                                                |
| Not implemented       | DNS                    | lookup, lookupService, generic resolve                                                  | S per current docs                                   | Preserve documented failure, rather than silently use a device resolver.                                                                                                                                             |
| **Complete**            | Net                    | isIP/isIPv4/isIPv6, BlockList, SocketAddress                                            | A                                                    | Pinned export, argument, state and matching contracts, including malformed inputs. Accepted at 35316ae.                                                                                                                                                     |
| **Complete**       | Net                    | Socket/connect/createConnection, read/write/end/destroy                                 | C                                                    | Bounded native TCP transport with half-close, onread, flow control, cancellation, paused FIN/reset and cleanup contracts on both WebViews. Accepted at 35316ae.                                                                                                                       |
| **Complete**       | Net                    | Server/listen, accepting inbound platform sockets                                       | A                                                    | Pinned workerd registers a logical port and routes platform-provided sockets to net.Server through cloudflare:node. This is not an OS socket listener; the compatible public Server/Socket path is tested locally, including drop, pause and close ordering. Accepted at 35316ae. |
| Not implemented       | TLS                    | connect, TLSSocket connection and I/O                                                   | C                                                    | TLS socket transport, validation and relevant connection metadata. Audit supported options before choosing native SDK APIs.                                                                                          |
| Unverified            | TLS                    | checkServerIdentity, certificate/context representation                                 | A candidate / U detail                               | Parsing/name checks can be JS. createSecureContext material consumed by native TLS may require C; callback shape alone does not decide.                                                                              |
| Unverified            | TLS                    | server creation and other documented absent APIs                                        | S                                                    | Match Workers rejection.                                                                                                                                                                                             |

Sources: [FS](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/), [HTTP](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/), [HTTPS](https://developers.cloudflare.com/workers/runtime-apis/nodejs/https/), [DNS](https://developers.cloudflare.com/workers/runtime-apis/nodejs/dns/), [Net](https://developers.cloudflare.com/workers/runtime-apis/nodejs/net/), [TLS](https://developers.cloudflare.com/workers/runtime-apis/nodejs/tls/).

A native transport must also work when the handler executes in a Dedicated Worker: relay through the host with a narrowly defined MessagePort protocol if the Capacitor bridge is unavailable there. Do not pass plugin objects as cloned env bindings. Socket IDs, listener cleanup, backpressure, permission errors and runtime disposal belong to the transport contract. The HTTP(S) Fetch transport has passed this contract on both platforms. Raw TCP Socket transport also passes in both execution modes. The separate `node:tls` API remains uncertified; transport capability does not certify its public surface.

## All documented non-functional stub modules

The [official stub inventory](https://developers.cloudflare.com/workers/runtime-apis/nodejs/#non-functional-stub-modules) contains these 16 modules. Each has a planned route of **S through A** for the applicable compatibility profile; this is not an implementation status. Module-owned contracts now verify the implemented candidates listed in the status and local-acceptance sections. Independent review and remote CI are still required for Complete. `trace_events`, `_stream_wrap` and `worker_threads` remain pending implementation. Import availability alone is insufficient: contracts must cover export shape, no-op vs throwing behavior, state and errors.

| Implementation status | Modules          | What is not required for Workers parity                                   |
| --------------------- | ---------------- | ------------------------------------------------------------------------- |
| Unverified            | `http2`          | An HTTP/2 server/client stack                                             |
| Unverified            | `vm`             | New JS execution contexts                                                 |
| Unverified            | `cluster`        | Multiple OS processes                                                     |
| Unverified            | `domain`         | A full legacy Node domain runtime                                         |
| Unverified            | `trace_events`   | Native tracing infrastructure                                             |
| Unverified            | `wasi`           | A WASI host                                                               |
| Unverified            | `_stream_wrap`   | Node internal stream handles                                              |
| Unverified            | `dgram`          | UDP sockets                                                               |
| Unverified            | `inspector`      | V8 inspector integration                                                  |
| Unverified            | `sqlite`         | SQLite database/plugin                                                    |
| Unverified            | `child_process`  | Process spawning                                                          |
| Unverified            | `readline`       | Terminal input handling                                                   |
| Unverified            | `repl`           | Interactive Node shell                                                    |
| Unverified            | `tty`            | Native terminal descriptors                                               |
| Unverified            | `v8`             | V8 heap/runtime access                                                    |
| Unverified            | `worker_threads` | Node threads; a Web Worker is not evidence of this module's compatibility |

Dates/flags govern whether these are importable. Do not broaden a stub into a functioning API merely because the device could implement it. Separate binding features such as D1 or KV remain outside this inventory.

## Existing implementation vs planned feasibility

Each compatibility module owns a directory under `src/compat/<module>/`, with `index.ts` as its entry point. Subpaths and dependency declarations stay inside that directory (for example, `path/posix/index.ts` and `path/win32/index.ts`). Each module keeps its tests, including contract definitions and coverage, in the adjacent `index.spec.ts`; environment runners in `demo/tests/` execute those same contracts. Test code is excluded from the production compilation. TypeScript preserves the implementation structure in `dist/compat/`; the shared build aliases resolve to the compiled entry points.

| Current code                                                      | Actual evidence / gap                                                                                                                                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/vite.ts`, `src/esbuild.ts`                                   | Broad browser polyfills and shared overrides. General Node compatibility is not certified. esbuild maps unavailable modules to an empty object, which is not proof of Workers stub parity. |
| `src/build/shared.ts`                                             | Shared aliases for http, net, async_hooks, path, querystring, string_decoder and Cloudflare helpers. Extend this existing boundary; avoid separate Vite/esbuild truth sources.                  |
| `src/compat/http/index.ts`, `src/compat/cloudflare-node/index.ts` | HTTP client/server export and prototype audits, streaming, headers, validation and cancellation contracts are implemented. Public Cloudflare TCP dispatch also passes through the complete net dependency at 35316ae.        |
| `src/compat/async-hooks/index.ts`                                 | Scoped ALS and AsyncResource implementations exist; native continuation isolation is not established (see async-context inventory).                                                                                                                                        |
| `src/compat/globals/index.ts`                                     | Node injection, owned Web API installation, pre-evaluation, collision and cleanup contracts passed manager/independent review. Packed-consumer and CI gates passed at 13261ce.             |
| `src/features/index.ts`, `testing.ts`                             | Existing typed definitions, implementation coverage and lifecycle test harness are reusable. A new abstract framework is unnecessary.                                                      |
| Native document plugin                                            | Document rendering plus native TCP/TLS only. HTTP/1.1 framing/parsing runs in JS/WASM using llhttp. iOS uses Network.framework without AsyncHTTPClient/NIO; Android uses Netty without its HTTP codec. See the native boundary document. |

## First batch: implementation evidence and remaining work

The three module implementations have no declared exclusions and are **Complete
at `b1a58d1`**. Manager and independent acceptance reviews have no outstanding
code findings, and [all remote CI jobs passed](https://github.com/rdlabo-dev/capacitor-workers/actions/runs/38999137150).
The subsequent whole HTTP/net/bridge acceptance is recorded above; these three first-batch modules retain their earlier certification.

Baseline: workerd **1.20261012.1**, compatibility date **2026-10-17**, no additional
compatibility flags. The contract is shared by workerd and both local execution
modes, rather than maintaining separate expected outputs for the browser.

| Unit                                                   | Implemented and tested                                                                                                                                                                                                                                           | Contract groups |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `node:path`, `path`, and both `posix`/`win32` subpaths | All exported operations, POSIX and Windows paths, UNC/namespaces, relative resolution, invalid arguments and export identity. `matchesGlob` reproduces the baseline's actual rejection.                                                                          | 14              |
| `node:querystring`, `querystring`                      | All seven exports, separators, duplicate keys, limits, malformed escapes, null-prototype results, custom codecs, URI errors and BOM preservation.                                                                                                                | 11              |
| `node:string_decoder`, `string_decoder`                | Constructor, `write`/`end`/`text`, all baseline encodings, `lastChar`/`lastNeed`/`lastTotal`, partial and invalid input, BOM, input windows, invalid receivers and reuse after `end`.                                                                            | 15              |
| HTTP / Cloudflare Node bridge (earlier evidence; completed at `35316ae` above)             | Server/port descriptors, lifecycle, streaming, asynchronous errors, dispatch context, client request/get/validation/destroy/timeout, headers and baseline stubs. Six additional real-network groups exercise the client through native Fetch and pinned workerd. | 18              |

Path and querystring adapt the pinned workerd source. StringDecoder uses a local
UTF-8 state machine plus adapters around the npm `string_decoder` implementation
for other encodings. Each module carries its upstream notices and Apache license;
the build copies these into the npm tarball and the packed-consumer test checks
their presence.

Earlier global/transport verification at `13261ce` (historical evidence):

- Root unit tests: 217 passed; root and demo type checking passed.
- Pinned workerd: 89 tests passed, including 58 shared Node groups, real-network
  Fetch/HTTP comparisons, Headers/Request/Response, structuredClone, Encoding
  and Abort. The explicit online TLS suite passed all 3 cases.
- Chromium/WebKit: 42 runtime tests; the added Encoding/Abort cases also passed
  in both direct and Dedicated Worker execution. Vite/esbuild passed 7 build
  unit tests and 30 integration tests, including configured entry evaluation.
- Packed consumer: 26 direct, 22 isolated and 144 common feature cases passed;
  Vite/esbuild/raw ESM 10 cases and configured Vite development 2 cases passed.
  Candidate internal APIs resolve from the installed tarball, not checkout sources.
- iOS 26.1 and Android 16 each passed 280 runtime checks with no exclusions,
  including 116 Node groups across direct and Dedicated Worker execution.
  Generated evidence is under `demo/artifacts/node-light/`.
- Each native platform passed 86 network checks through the public runtime:
  streaming, redirects, headers, decompression, cancellation, runtime/Worker/page
  teardown, Node HTTP clients and TLS trust/hostname validation. The TLS negative
  cases reject DNS errors/timeouts as invalid evidence. Reproduce using
  [the network acceptance runner](../demo/tests/README.md#native-outbound-http-contracts).
- Both platforms' fresh npm-tarball consumers passed 50 Hono and 50 Express
  checks each, including background/relaunch/update/reinitialization.
- HTTP review corrections include strict content-length accounting, argument
  validation, header arrays, no-Host behavior, path mutation and Agent options.
  Node/Web global review corrections include lazy-load disposal, pre-evaluation
  ordering and AbortSignal constructor/method ownership.
- [Remote CI at `13261ce`](https://github.com/rdlabo-dev/capacitor-workers/actions/runs/39007518228) passed all five jobs. The earlier first-batch certification remains `b1a58d1`.

Historical transport dependencies at `13261ce` (superseded by [the Web transport](native-boundary-audit.md)): iOS used AsyncHTTPClient 1.36.2 with Swift NIO;
Android uses Netty 4.1.139.Final and requires the documented consumer Gradle
metadata merge. Native builds require Swift 6.2/Xcode 26 and Java 21. Brotli's
embedded decoder module is 290,193 bytes (128,819 bytes gzip) and initializes
lazily for Brotli responses. It produces bounded output chunks; transport tests
cover cancellation and bounded streaming. These are dependency/artifact costs,
not claims about release application size or device startup latency.

Reproduce from the repository root (after installing root and demo dependencies):

```sh
npm run build
npm run test:workers --prefix demo -- tests/workers/node-compat.test.ts
npm run test:runtime --prefix demo
npm run test:runtime:dev --prefix demo
npm run test:build-tools --prefix demo
npm run test:package
npm run test:native:prepare --prefix demo -- runtime
npm run sync --prefix demo
npm run ios --prefix demo       # or: npm run android --prefix demo
```

Workers path resolution uses `/`, even though `process.cwd()` reports `/bundle`.
This behavior comes from the pinned path implementation; it does not depend on
implementing a virtual process. Workers' own `matchesGlob` failure is a passing
contract expectation, never a skipped or unsupported local case.

## Completion boundary and remaining work

Completed units do not certify other modules or the entire package.

- **HTTP, Cloudflare Node bridge and net:** completed at `35316ae`. Native
  outbound TCP and public logical Server/Socket dispatch are both verified.
  This does not certify `node:https`, `node:tls` or `node:stream` as modules.
- **Node/Web globals:** completed at `13261ce`. Module-scope Workers extensions
  require configured/lazy loading as documented. This does not certify the
  complete Buffer/process modules, other Workers Web APIs or other engine versions.
- **Other module families:** their existing Unverified/Not implemented statuses
  are unchanged; passing the current contracts does not certify those modules.

## Decisions required before implementation

| Investigation            | Output required to close U                                                                                                                               | Consequence                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Pinned export audit      | Export and selected prototype-method manifest, including subpaths, flags, stubs, module/process/os/perf APIs; source references where docs omit behavior | Refines the inventory without inheriting all Node APIs by accident. Importability alone never closes compatibility. |
| Async context            | Concurrent/nested await tests with native promises, timers, exceptions, dynamic imports and unhandled rejection on iOS/Android                           | Choose supported engine primitive or whole-program transform; otherwise explicitly retain the architecture gap.     |
| Crypto                   | Algorithm/key-format matrix, published vectors, synchronous API tests, non-extractable keys and timing guarantees assessment                             | Choose JS/Web Crypto, explicit Wasm or required native assistance per API.                                          |
| Transport                | CORS/headers/cookies/redirect/stream tests plus TCP/TLS cancellation and validation in both native platforms                                             | Define the minimal native plugin contract; retain plain-browser limitations.                                        |
| Engine-dependent exports | Verify which are real Workers APIs, then distinguish observable semantics from implementation details                                                    | Avoid implementing V8 internals for a Workers stub; identify genuine D cases.                                       |
| Polyfill audit           | Run the same cases in workerd and each adapter; record exports that are missing or behave differently                                                    | Reuse tested dependencies and replace only proven gaps.                                                             |

The inventory stage is complete when every overview category and stub has a route or an explicit unresolved question, as above. **Full implementation completion is a different gate**: export-level coverage, behavior contracts, build-tool integration and native evidence are still required. No A/B/C/U row should be advertised as supported from this document alone.

For implementation, preserve one contract suite across workerd, direct execution and Dedicated Worker execution; validate Vite and esbuild resolution plus packed-consumer behavior. Globals must be ready before module evaluation. Scope state to the runtime, restore owned patches on disposal and avoid overwriting unrelated application globals. A `window` replacement is neither necessary nor sufficient.


## Buffer acceptance

The `node:buffer` implementation replaces the dependency fallback for both
`node:buffer` and `buffer`. Its acceptance unit includes every named/default
export, Buffer static and prototype methods, numeric operations, encodings,
shared backing memory, errors, inspection, transcode, Blob and File. The pinned
baseline remains workerd `1.20261012.1`, compatibility date `2026-10-17`.
Workers' own unsupported `resolveObjectURL` and Blob/File `endings` behavior is
verified as an expected rejection, not excluded from coverage.

Implementation and the shared 24-group contract live together in
[`src/compat/buffer/`](../src/compat/buffer/index.spec.ts). Numeric tests include
independent byte expectations, and transcode covers 96 fixed workerd vectors.
Blob/File tests include conversion order, mutable inputs, subclass branding,
structured cloning, host interoperability, installation/restoration and late
loading from another bundle. The implementation uses Web APIs only; no native
plugin code is added.

Integration preserves the same Buffer/Blob/File identity for application code
and dependencies in Vite development, production and esbuild. The native run
also exposed an Android WebView URL difference: a host containing a space is
accepted and percent-encoded. The existing HTTP client now rejects it before
network I/O, matching the existing fixed-workerd contract.

Local acceptance on 2026-10-18 covers implementation commit `7da2af9`
(source tree `a1994ee3717f38a14ba4d911e0da2cbedc7d99b1`) and the runner
cleanup/result checks in `7a1d27e`:

| Gate | Result |
| --- | --- |
| Library build and root/demo typechecks | Passed |
| Unit tests | 297 passed |
| Fixed workerd | 93 passed; added encoded-host case also passed in the shared Node contract |
| Chromium/WebKit production runtime | 66 passed |
| Vite development runtime | 20 passed |
| Build-tool checks | 7 build tests and 30 Chromium/WebKit integration tests passed |
| Ordinary Hono/Express demo | 8 passed |
| Document/form regression suite | 72 accepted results, including 6 existing WebKit expected failures; no new exclusions |
| Independently installed npm tarball | Vite/esbuild/raw ESM 10/10, configured dev 2/2, direct 26/26, isolated 22/22, common features 210, preferences 2/2 |
| iOS 26.1, iPhone 17 Pro simulator | 346 passed, zero failures/exclusions; Buffer 24 direct + 24 Worker |
| Android 16, Chrome WebView 155, emulator | 346 passed, zero failures/exclusions; Buffer 24 direct + 24 Worker |
| Manager and independent acceptance review | Required code changes resolved |

Both native runs used identical runtime assets: SHA-256 of
`capacitor-workers-assets.json` is
`dcdc6cc5fe9163d167ba5e758dc0bbdf20c1f9e53fa987d9a68b1829a147cdde`;
`index.html` is
`d3f0e375076e8512d617eff8c975a249c914c1ac2b51e460f8132613e41a4dfb`.
The final native runs identify commit `7a1d27e`. Their manifests report a dirty
checkout because this acceptance document was still being updated; production
and test sources matched that commit. The manifests retain the observed dirty
flag rather than relabeling the execution as a clean checkout.
Logs and manifests are retained locally in `demo/artifacts/buffer-acceptance/`.

This branch has not been pushed, so remote CI has not run. **The Complete label
remains gated on CI; this is not a partial-support release.** The module contract
is wired into the existing Workers, runtime, development and packed-consumer CI
jobs; no separate opt-in test command is needed for Buffer.

Reproduce the JavaScript gates from the repository root:

```sh
npm run build
npm test
npm run typecheck
npm run typecheck --prefix demo
npm run test:workers --prefix demo
npm run test:runtime --prefix demo
npm run test:runtime:dev --prefix demo
npm run test:package
npm run test:build-tools --prefix demo
npm run test:browser --prefix demo
npm run test:documents --prefix demo
```

For native verification, prepare the existing runtime test application using
[the native test procedure](../demo/tests/README.md#native-checks). Run the full
suite on iOS and Android and retain `FEATURE_REPORT` and `NATIVE_SUMMARY` logs.
Both `node.buffer` reports must contain all 24 passing groups, and the final
summary must contain no failures or exclusions. Do not accept only the Buffer
subset while other runtime checks fail.

## Timers acceptance

The acceptance unit is `node:timers` together with `node:timers/promises`, using
workerd `1.20261012.1`, compatibility date `2026-10-17`, and no additional flags.
Both bare and `node:` imports resolve to the same implementation. Sources and the
shared 30-group contract live in [`src/compat/timers/`](../src/compat/timers/index.spec.ts).

The export audit covers `Timeout`, callback timers and all clear functions,
`active`, `enroll`, `unenroll`, the `promises` namespace and both default exports.
The Promise subpath covers timeout values, immediate values, interval iteration,
`scheduler.wait()` and `scheduler.yield()`. Timeout prototype checks cover
refresh, close, numeric conversion, disposal and ref state. Workers' deprecated
`enroll()` rejection and inert ref/unref scheduling semantics are tested as
expected results. Delays beyond the browser's signed 32-bit range are scheduled
in chunks rather than accidentally firing immediately.

Cancellation tests distinguish the JavaScript Promise helpers from Workers'
native scheduler: the latter ignores shadowed signal properties and event
propagation cancellation, and transports abort reasons rather than retaining
object identity. Tests include errors, DOMException, non-cloneable values,
throwing getters, null prototypes and spoofed tags. Host timer chunking and
installation ownership/rollback have adjacent unit tests.

Node timer globals are installed through the existing configured Worker bootstrap;
raw browser ESM remains Web-only. Vite and esbuild inject only Node global values,
separately from lifecycle installation. ALS callback capture preserves timer
identity and ownership, including multiple independently loaded ALS modules.
This does **not** certify async-hooks as a whole: its pre-existing settle-restore
and interleaved-context exclusions remain visible in reports.

No native plugin implementation is added. Local verification and review results
are recorded below; remote CI must pass before this unit is marked Complete.

Local acceptance on 2026-10-18 for implementation commit `4c73eb7`:

| Gate | Result |
| --- | --- |
| Library build, root/demo typechecks and changed-source formatting | Passed |
| Unit tests | 304 passed |
| Fixed workerd | 93 passed, including all 30 timers contract groups |
| Chromium/WebKit production runtime | 66 passed |
| Vite development runtime | 20 passed |
| Build tools | 7 build tests and 30 integration tests passed |
| Independently installed npm tarball | Vite/esbuild/raw ESM 10/10, configured dev 2/2, direct 26/26, isolated 22/22, common features 294 passed + 4 existing ALS exclusions |
| Hono/Express demo | 8 passed |
| Document/form regression | 72 accepted results, including the 6 existing WebKit expected failures |
| iOS 26.1 and Android 16 WebViews | Each: 430 passed + 4 existing ALS exclusions; timers 30 direct + 30 Dedicated Worker passed with no timer exclusions |
| Manager and independent code reviews | Passed after correction and re-review |
| Remote CI | [Passed](https://github.com/rdlabo-dev/workers-capacitor/actions/runs/39093405066) at `c5fb8a4`; merged as `400d022` |

Native runs used a separate test application ID to avoid overwriting another
verification app. Their reports identify the platform, device and built-asset
fingerprints. Local logs and native JSON are saved under
`demo/artifacts/timers-acceptance/` (generated, not shipped). The native harness
runs suites that own the page Fetch adapter sequentially, and each standalone
Web API suite owns a runtime for the lifetime of its globals.

After merging main at `b41b01c`, the combined contracts include the four new
module suites and the existing `nestedAsyncRestore` exclusion. Revalidation
passed: build and root/demo typechecks, 308 unit tests, 93 workerd tests,
66 production browser tests, 20 Vite development tests, 7 build-tool unit tests,
30 build-tool integration tests, and the packed consumer
(320 feature passes + 6 declared async-hooks exclusions). The native results
above remain evidence for `4c73eb7`; they do not claim a native rerun of the merge.


## URL acceptance

The acceptance unit is the complete `node:url` / `url` module, against workerd
`1.20261012.1`, compatibility date `2026-10-17`, with no additional flags.
The module and adjacent tests live in [`src/compat/url/`](../src/compat/url/index.spec.ts).
The export audit covers all 13 named exports and the default namespace, including
URL/URLSearchParams, legacy Url, parse/format/resolve/resolveObject, domain
conversion, file URL helpers, toPathIfFileURL and urlToHttpOptions.

The configured runtime owns/restores the global URL constructor so global and
module identity agree. It uses the pinned WHATWG URL JavaScript parser because iOS WebView rejects
some ASCII IDNA output that Workers accepts. It matches Workers' unsupported
createObjectURL/revokeObjectURL behavior. URLSearchParams uses the platform
constructor and a native query owner, retaining live linkage, borrowed method
behavior and native Request/Response BodyInit branding. The full prototype is
audited.
Pre-installation URLs and URLs created by separately loaded bundles remain valid
inputs to Node helpers. Installation tests cover ownership, rollback, disposal
and an application replacing the global.

IDNA mapping, Bidi and ContextJ behavior use tables extracted from the exact
Ada 4.0.0 archive pinned by workerd. Punycode is pure JavaScript; NFC uses
String.prototype.normalize. The maintainer generator pins the archive SHA-256;
its C++20 extraction step is not part of library builds or consumer requirements.
No native plugin or Wasm runtime is added. Notices travel with the package.
The generated IDNA tables occupy about 239 kB and the generated WHATWG parser
about 114 kB of source before bundling/compression. The parser is regenerated
from `whatwg-url` 17.3.0 and the lockfile; consumers do not install that package.

The shared contract includes upstream modern/legacy URL vectors, 1,364 IDNA
comparisons and 837 constructor/base/setter comparisons captured against the
fixed workerd profile. Both successful values and rejected inputs are compared
in direct and Dedicated Worker execution. The vectors include Unicode-mapped
host delimiters, pinned Bidi assignments, file localhost, UNC-like paths,
Windows drive roots and opaque custom schemes.

Local acceptance on 2026-10-18 for implementation commit `b1f3f12`:

| Gate | Result |
| --- | --- |
| Library build, root/demo typechecks and URL source formatting | Passed |
| Unit tests | 313 passed |
| Fixed workerd | 93 passed; all 19 URL contract groups passed |
| Chromium/WebKit production runtime | 66 passed |
| Vite development runtime | 20 passed |
| Build tools | 7 build tests and 30 integration tests passed |
| Independently installed npm tarball | Vite/esbuild/raw ESM 10/10, configured dev 2/2, direct 26/26, isolated 22/22; common features 358 passed + 6 existing ALS exclusions |
| Hono/Express demo | 8 passed |
| Document/form regression | 72 accepted results, including 6 existing WebKit expected failures |
| iOS 26.1 and Android 16 WebViews | Each: 494 passed + 6 existing ALS exclusions; URL 19 direct + 19 Dedicated Worker groups passed with no URL exclusions |
| Manager and independent acceptance reviews | Passed after correction and re-review |
| Remote CI | Pending PR publication; required before Complete |

The first native run rejected a domain that desktop browsers accepted. This
motivated the JS parser, rather than excluding the input or adding a native
plugin. Query interoperation and the dependency-free raw ESM path were corrected
and re-reviewed before the final runs. Global URL recognition is isolated in
`brand.ts`, so Web-only entrypoints do not import the Node URL parser.

Both final native reports identify clean revision `b1f3f12`, the device and built
asset fingerprints. Logs and JSON evidence are retained locally under
`demo/artifacts/url-acceptance/` (generated, not shipped). The existing isolated
native test consumer was reused, with freshly packed library installation and
runtime fixture assets. No URL case is excluded; the six exclusions belong to
the existing async-hooks unit. Remote CI remains the merge/release gate.


## Virtual platform and Punycode local acceptance

`os`, `tty`, `wasi`, and `punycode` use the pinned workerd sources and keep their
shared contracts next to their implementations. The contracts cover all named
and default exports, fixed platform/constants behavior, class/prototype identity,
input validation, callback order and the actual Workers unsupported operations.
Punycode includes upstream RFC vectors and Unicode/surrogate cases. These units
add no native implementation or runtime dependencies.

At `8d4d508`, iOS 26.1 and Android 16 each passed **542 runtime checks**, with
only the six pre-existing async-hooks exclusions. Each of the four new modules
passed every group in both direct and Dedicated Worker execution (6 os, 5 tty,
8 wasi, 5 punycode). Native reports identify clean revision `8d4d508` and artifact
hashes; evidence is retained in `demo/artifacts/node-completion-acceptance/`.

Local checks also passed: build/typechecks, 343 unit tests, 93 workerd tests,
66 production Chromium/WebKit tests, 20 Vite development tests, 7 build-tool
unit tests and 30 integration tests. The packed consumer passed 10 build-tool/raw
ESM, 2 development, 26 direct, 22 isolated, 406 shared features plus the 6 existing
ALS exclusions, and 2 preference checks. Vite development now optimizes net with
tty to preserve Socket constructor identity. Remote CI and independent acceptance
review remain pending, so these units are not marked Complete.

The separate async-lowering experiment passes concurrent/nested restoration in
Chromium and WebKit after esbuild converts async functions to explicit Promise
continuations. This is only evidence for a possible build-time route. It does not
certify async-hooks, dynamic imports, unhandled rejection, third-party native
async callbacks or every build/runtime mode.

### Constants, V8, HTTP/2 and VM local acceptance

At `719b8fe`, shared contracts cover `constants` (3 groups), `v8` (11),
`http2` (5), and `vm` (10), alongside the earlier platform modules.
The full suite passed 343 unit tests, the fixed-workerd Node contract,
20 Vite development tests, 7 build tests and 30 Vite/esbuild browser tests.
The fresh installed tarball passed 464 common contracts with the same 6
pre-existing ALS exclusions, 26 direct / 22 isolated cases, 10 build/raw-ESM
cases, 2 development cases and 2 preference cases.

iOS 26.1 and Android 16 each passed **600 runtime checks plus 6 existing ALS
exclusions** from clean revision `719b8fe`. Every new module group passed in
both direct and Dedicated Worker execution. Evidence is retained under
`demo/artifacts/node-completion-acceptance/` locally.
This is local validation, not completed remote CI or independent review.

Vite development verification caught a circular dependency caused by injecting
`global`/`process` through a module that also imports Buffer. Non-Buffer globals
now have an independent injection source; production, development, esbuild and
installed-package regressions passed after this correction.

### Async transform boundary experiments

The ES2016 lowering prototype restores concurrent/nested context in Chromium
and WebKit only for the instrumented code. Two additional counterexamples are
covered by `async-transform.test.mjs`:

- An untransformed native async callback still loses context even when its caller
  was transformed. Ordinary raw JavaScript, separately loaded dependencies and
  code produced at runtime cannot be certified by transforming just the entry.
- esbuild's ordinary async lowering observes a Promise's overridden `then` getter
  where native `await` does not, introducing a rejection. Lowering is not an
  observationally equivalent replacement for native async semantics.

These experiments do not prove every possible compiler/runtime design impossible.
They rule out advertising the current monkeypatch or ordinary esbuild lowering
as complete `async_hooks` compatibility. Full support requires a different
execution contract or engine capability; the six existing ALS exclusions remain.

### Process, terminal and inspector local acceptance

At clean revision `5169e5e`, adjacent shared contracts cover `child_process`
(5 groups), `cluster` (5), `dgram` (6), `inspector` including promises (8),
`domain` (6), and `readline` including promises (8). They exercise Workers'
actual non-networking/non-terminal behavior, including validation, public
prototypes, mutable state, events, callback timing, symbols and disposal.
`inspector/promises` deliberately preserves synchronous exceptions that differ
from ordinary `inspector`; `readline` returns empty answers rather than throwing.

- Root and demo typechecks, the fixed-workerd contract, Chromium/WebKit production
  (66) and development (20), and build integrations (7 unit + 30 browser) passed.
- A fresh installed tarball passed 540 common contracts plus the same 6 ALS
  exclusions, 26 direct / 22 isolated, 10 build/raw-ESM, 2 development and
  2 preference cases.
- iOS 26.1 and Android 16 each passed **676 runtime checks plus the same 6 ALS
  exclusions**. Each new module passed in direct and Dedicated Worker execution.
- Eight inventory/engine experiments passed, including both async transform
  counterexamples. Export enumeration does not replace behavior contracts.

No new module is certified Complete by these local checks alone; independent
review and remote CI are outstanding. Remaining functional families in the
implementation sequence are still unfinished.

### Mandatory-prefix module comparison

The pinned workerd runtime exports `node:test` (`mock`, `MockTracker`,
`MockFunctionContext`), while the installed Wrangler builtin resolver rejects
its static import. The shared Node-contract Vitest test now bundles with esbuild,
leaves `node:*` imports external, and runs the result in the same pinned workerd
through Miniflare. Bare builtins are normalized to their `node:` form. This
keeps the oracle as the real runtime; it does not substitute local compatibility
implementations or claim that Wrangler's static resolver supports `node:test`.

The SQLite contract matches the pinned profile: both exposed constructors throw
`TypeError: Illegal constructor`, and backup throws synchronously. It does not
create a local SQLite database and is separate from D1 support. Other dates/flags
that expose functioning SQLite require a separate compatibility profile.

### REPL, SQLite and mock tracking local acceptance

At clean revision `052647f`, `repl` has 6 contract groups, `sqlite` 4, and
`test` 14. The mock contracts cover calls, constructors, replacements, one-shot
implementations, limits, descriptors, accessors, restoration and validation,
including the pinned runtime's symbol-method restoration behavior. SQLite
constructor names are explicitly retained after production minification.

| Local check | Result |
| --- | --- |
| Build, root/demo typechecks | Passed |
| Unit tests | 343 passed |
| Fixed workerd suite | 93 passed |
| Chromium/WebKit production / development | 66 / 20 passed |
| Build-tool tests | 7 unit + 30 browser passed |
| Fresh installed tarball | 588 common passed + 6 existing ALS exclusions; 26 direct / 22 isolated, 10 build/raw-ESM, 2 development, 2 preference cases |
| iOS 26.1 | 724 passed + 6 existing ALS exclusions |
| Android 16 | 724 passed + 6 existing ALS exclusions |

Both native reports identify clean revision `052647f` and asset fingerprints.
Every group in all 17 newly implemented families passes in direct and Dedicated
Worker execution, without new exclusions or native plugin changes.

**The overall Node compatibility task is not complete.** The remaining sequence
still includes util/assert/events, stream, writable FS/module/process,
HTTPS/TLS/DNS facades, crypto/zlib, async context/diagnostics, console/performance,
and the remaining tracing/thread/stream-wrapper surfaces. Existing Complete
certifications remain separate from these pending families and local candidates.

## Shared util completion work and oracle correction

The `util` contract now imports `node:util`, so the workerd runner executes the
real builtin and Vite/esbuild resolve the same contract to the local adapter.
Previously, the test imported the local source even in the workerd runner.
The `stream/web` contract has received the same correction. Historical smoke
results from those test paths must not be read as builtin parity evidence.

`fs` and `module` still use local VFS setup and remain local smoke tests. They
are no longer included in the workerd comparison report. Equivalent workerd
fixtures and full module coverage remain required; they are not waived.

The adjacent util contract now contains ten groups covering encoders, default
export identity, promisify/custom promisification, callbackify and falsy
rejections, dotenv parsing and malformed inputs, inheritance/extension helpers,
and the pinned Workers unsupported operations. The implementation ports the
fixed workerd source for these operations, including its custom argument-name
symbol, microtask scheduling and parser edge cases. Original notices are shipped
beside the module. This is development work: inspection, types, MIME, async abort,
call sites, styling and the remaining util surface still prevent whole-module
acceptance. No Complete status is assigned to util by these passing groups.

Local validation for the util core changes at `42399b6`:

- Root and demo typechecks pass; 343 unit tests pass.
- The corrected pinned-workerd Node contract passes, including ten util groups.
  The two local-only VFS/module smoke suites are excluded from that oracle report,
  rather than counted as builtin comparisons.
- Chromium/WebKit production tests pass (66); Vite development tests pass (20).
- The installed tarball consumer passes 26 direct and 22 isolated checks,
  604 common cases plus the existing six ALS exclusions, ten Vite/esbuild/raw ESM
  checks, two configured Vite development checks and both preference checks.
  After disk exhaustion during the build-tools stage, the same installed consumer
  was reused to rerun the consumer tests successfully.
- iOS 26.1 and Android 16 each pass 740 runtime checks with the six existing ALS
  exclusions. The ten util groups pass in both direct and Dedicated Worker modes.
  Both reports record clean revision `42399b6`; local evidence is retained in
  `demo/artifacts/util-core-acceptance/`.

The package runner now verifies a unique identity file before using its preview
server, preventing a stale server on the configured port from supplying another
build's results. The default port remains 4189 and can be overridden using
`CONSUMER_PREVIEW_PORT` for independent local runs. No new module has received
whole-module acceptance, independent review or remote CI from this work.
