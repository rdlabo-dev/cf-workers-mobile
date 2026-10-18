# Remote service binding dispatch

## Unit and status

The unit is build-generated HTTP dispatch of an existing Worker's fetch handler
when it uses R2, Service Bindings or Queue producers. KV alone does not select
remote execution. Binding methods
execute unchanged inside the deployed Worker. This does not install local R2,
KV synchronization, a client RPC proxy, or a queue consumer in Capacitor.

Status: **In progress** pending independent review and CI.
The workerd integration baseline is Miniflare `5.20261012.0-beta`, compatibility
date `2026-10-01`. Browser integration is supporting evidence, not native
transport certification.

## Configuration

Use the existing Worker entry and its Wrangler configuration with either the
Vite or esbuild plugin:

```ts
capacitorWorkersPlugin({ worker: "src/worker.ts" });
```

The compiler discovers `r2_buckets[].binding`, `kv_namespaces[].binding`,
`services[].binding` and `queues.producers[].binding`, including named Wrangler
environments. JSON, JSONC and TOML are supported. Existing D1 and Hyperdrive
bindings remain supported. Only names enter the build analysis: resource IDs,
credentials and connection strings are not runtime client configuration.

For nonstandard configuration locations, supply `workerConfig`. Explicit
`r2Bindings`, `kvBindings`, `serviceBindings` and `queueBindings` arrays override
discovery for their respective kind only. KV names are eligible for local
execution by default; `kvBindings` does not force remote execution. R2, Service
Bindings, Queue producers, D1 and Hyperdrive require the server. A name shared
between KV and a server binding remains server-only.

Execution location determines the binding instance:

- A KV-only route stays local and uses the KV supplied through runtime `env`.
- A route using R2 and KV is dispatched as one request. Both bindings execute on
  the original Worker, using cloud KV. It never runs part of that handler locally.
- Conservative whole-Worker fallback runs every route remotely, including KV-only
  routes. Inspect the build report for that decision.

Provide local KV through the existing feature API, using the same binding name as
Wrangler. The build discovers names, not device storage instances. Missing `env`
configuration does not silently switch to cloud KV. There is no cloud/device
synchronization. `localBindings` is still available for other explicitly supplied
local bindings; KV no longer needs that extra declaration.

```ts
import { openFeature } from "@rdlabo/capacitor-workers/features";
import { LocalStorageKV } from "@rdlabo/capacitor-workers/features/kv";
const kv = await openFeature(new LocalStorageKV("my-app-settings"));
// Pass env: { KV: kv.api } to capacitorWorkers; KV must match Wrangler's name.
// At shutdown: await runtime.dispose(); await kv.dispose();
```

Function-bearing bindings use direct execution even with `prefer: "worker"`.
This is the existing [local KV execution contract](kv.md), not binding RPC into a
Dedicated Worker. Remote requests are still selected before local execution and
use the deployed Worker's own bindings, never the local `env` instance.

```ts
const runtime = capacitorWorkers({
  baseURL: "https://local.invalid/",
  prefer: "worker", // local function-bearing env selects direct execution
  env: { KV: kv.api }, // use the binding name declared in Wrangler
  remote: {
    origin: "https://your-existing-worker.example",
    getToken: () => existingSession.accessToken,
    maxBufferedBodyBytes: 8 * 1024 * 1024,
  },
});
```

Selected requests go to this origin with the original path, query, method and
body before local execution. Safe unrelated routes remain local. If partitioning
cannot be proven safe, the entire Worker is dispatched remotely. Inspect
`capacitor-workers-server.json` for that decision. Wrangler Queue consumer
configuration forces whole-Worker dispatch, including consumer-only projects;
queue handlers must remain on the server. Queue delivery is never started inside
the app.

## Uploads and memory

Browser uploads and native redirect-follow requests buffer at most 8 MiB by
default. `maxBufferedBodyBytes` accepts a nonnegative safe integer in bytes;
zero permits only empty bodies. An oversized stream is cancelled and rejects
before transport dispatch. Buffered bytes are copied into bounded growing
storage without retaining incoming chunks' potentially larger backing buffers.
Native manual/error redirect modes stream instead of buffering for replay.

This limit bounds this transport buffer, not total application memory, concurrent
requests, caller-allocated blobs or the Dedicated Worker bridge. Apply application
size and concurrency limits before allocating bodies. For large R2 objects,
implement multipart endpoints in the existing Worker and keep individual requests
within the budget. The adapter does not automatically split uploads, retry failed
writes, abort abandoned multipart sessions, or undo effects of an aborted request.

## Security and semantics

Keep authentication, tenant/object ownership, validation, rate limits and allowed
operations in the deployed Worker. The client selector is an optimization and code
separation mechanism, not an authorization boundary. Binding access and RPC stay
inside that Worker; this feature creates no generic public binding/RPC endpoint.
Service RPC is invoked by the existing HTTP handler using its existing authority.

Native Cookie and redirect behavior use the shared transport. Retain CSRF checks;
remapped Origin/Referer values alone do not establish trusted intent, and HttpOnly
does not prevent compromised app scripts from making authenticated requests.
See the [D1 security contract](d1-transparent-migration.md#shared-transport-security-and-upload-limits).

Cloud KV retains its cloud consistency model. Queues retain at-least-once delivery:
consumers must handle duplicate messages idempotently. A successful HTTP response
from enqueueing does not mean that downstream processing has completed. Network
failure or cancellation does not prove a write/enqueue did not happen. The client
adds no automatic retry or offline write queue.

## Reproducible evidence

Run `npm run build`, `npm test`, then `npm run test:service-bindings` in `demo`.
The latter executes a real workerd R2 bucket, KV namespaces, HTTP/RPC service and
queue consumer under Chromium and WebKit, Vite and esbuild, direct and Dedicated
Worker execution, with both selective and whole-Worker builds (16 combinations).
It checks server state, R2 ranges/conditions/HEAD/multipart/delete, KV metadata,
service HTTP/RPC, queue send/batch delivery, authorization rejection, pre-send
upload limits, offline local routes and client artifact exclusion. Results are
written to `demo/artifacts/service-bindings/report.json`.

These browser runs intercept HTTPS requests into local workerd. Vite development
startup additionally verifies local and HTTP/RPC routes in direct/Worker modes.

A freshly packed tarball was independently installed into the native test consumer.
iOS 26.1 (iPhone 17 Pro simulator) and Android 16 / API 36 (`emulator-5554`) each passed 30
checks in direct and Dedicated Worker modes on 2026-10-18. These use actual native
HTTPS with a test CA and local workerd, covering R2 read/write/range/HEAD/delete,
KV metadata, device/cloud KV separation, remote precedence for mixed R2/KV,
service HTTP/RPC, actual queue send/batch delivery, authentication,
and rejection of oversized uploads before storage changes.
See [native evidence](remote-service-bindings-native-evidence.json) for the package
integrity and individual results. The native matrix uses Vite production output;
esbuild and whole-Worker variants are covered by browser integration. It does not
certify physical devices, deployed Cloudflare infrastructure, or every shared
transport contract (Cookie, redirects and cancellation have separate D1 tests).

Reproduce with the existing native harness:

```sh
node demo/tests/experiments/d1/native-server.mjs --services
# In another terminal, while the server is running:
node demo/tests/experiments/d1/native-prepare.mjs --services
node demo/tests/experiments/d1/native-run.mjs ios <simulator-id> --services
node demo/tests/experiments/d1/native-run.mjs android <emulator-id> --services
```

Use `--refresh` with an existing services-native consumer to reuse its native
build directories while installing a new tarball. The harness reuses the D1 test
app ID; do not run D1 and service native tests concurrently on the same device.
The full `npm run test:package` regression did not finish successfully locally.
Its build-tools stage passed when rerun alone, but the full retry failed while
the host exhausted disk space (`git commit` also reported `No space left on
device`). This is not recorded as a package-suite pass; rerun with available
disk space. The independent native tarball installation above did pass.

Independent manager/acceptance review and required CI remain merge gates; do not
mark this unit Complete based on these local results alone.

## Platform references

- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [Cloud KV behavior](https://developers.cloudflare.com/kv/concepts/how-kv-works/)
- [Service HTTP](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/)
- [Service RPC](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/)
- [Queue delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)
