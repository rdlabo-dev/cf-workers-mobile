# Remote service binding dispatch

## Unit and status

The unit is build-generated HTTP dispatch of an existing Worker's fetch handler
when it uses R2, remote-configured KV, Service Bindings or Queue producers.
KV-only requests use local storage only when their route is selected for local
execution and the binding policy is local. Remote binding methods
execute unchanged inside the deployed Worker. This does not install local R2,
KV synchronization, a client RPC proxy, or a queue consumer in Capacitor.

The workerd integration baseline is Miniflare `5.20261012.0-beta`, compatibility
date `2026-10-01`. Browser integration is supporting evidence, not native
transport certification.

See [additional Cloudflare bindings and remote ASSETS](cloudflare-bindings.md) for
Durable Objects, AI, Workflows, generic remote names and asset execution policies.

## Configuration

Use the existing Worker entry and its Wrangler configuration with either the
Vite or esbuild plugin:

```ts
workersCapacitorPlugin({
  worker: "src/worker.ts",
  execution: [{ method: "*", path: "/settings/*" }],
  kvExecution: { SETTINGS: "local", SHARED: "remote" },
});
```

The example assumes existing `/settings/` registrations whose implementation and
retained dependencies may ship to the device. Adjust the selection to the app;
see [execution configuration](cloudflare-bindings.md#choosing-execution).

The compiler discovers `r2_buckets[].binding`, `kv_namespaces[].binding`,
`services[].binding` and `queues.producers[].binding`, including named Wrangler
environments. JSON, JSONC and TOML are supported. Existing D1 and Hyperdrive
bindings remain supported. Only names enter the build analysis: resource IDs,
credentials and connection strings are not runtime client configuration.

For nonstandard configuration locations, supply `workerConfig`. Explicit
`r2Bindings`, `kvBindings`, `serviceBindings` and `queueBindings` arrays override
discovery for their respective kind only. With a route-selection array or whole-Worker local execution, set `kvExecution`
to `local` or `remote` for every discovered (or explicitly listed) KV name.
Missing policies, unknown names and invalid values fail the build. The default
network execution keeps all requests remote and defaults KV policies to remote.
`kvBindings` lists names, while `kvExecution` chooses their location. R2, Service
Bindings, Queue producers, D1 and Hyperdrive require the server. A name shared
between KV and a server binding remains server-only.

Execution location determines the binding instance:

- An explicitly selected, locally executable KV-only route whose bindings are
  configured `local` uses runtime `env`. Unselected routes stay remote.
- A KV-only route using any `remote` KV binding is dispatched to the existing
  Worker. All operations in that request use the remote environment.
- A route using R2 and KV is dispatched as one request. Both bindings execute on
  the original Worker, using cloud KV. It never runs part of that handler locally.
- Conservative whole-Worker fallback runs every route remotely, including KV-only
  routes. Inspect the build report for that decision.

Provide local KV through the existing feature API, using the same binding name as
Wrangler. The build discovers names, not device storage instances. Missing `env`
configuration does not silently switch to cloud KV. There is no cloud/device
synchronization. `localBindings` is still available for other explicitly supplied
local bindings; KV uses `kvExecution` instead. Declaring a remote KV name in
`localBindings` is a build error. A `local` policy permits local execution but
does not override another server dependency or whole-Worker fallback.

```ts
import { openFeature } from "workers-capacitor/shared/contracts";
import { LocalStorageKV } from "workers-capacitor/cloudflare/bindings/kv";
const kv = await openFeature(new LocalStorageKV("my-app-settings"));
// Pass env: { SETTINGS: kv.api } to workersCapacitor; SETTINGS must match Wrangler's name.
// At shutdown: await runtime.dispose(); await kv.dispose();
```

Function-bearing bindings use direct execution even with `prefer: "worker"`.
This is the existing [local KV execution contract](kv.md), not binding RPC into a
Dedicated Worker. Remote requests are still selected before local execution and
use the deployed Worker's own bindings, never the local `env` instance.

```ts
const runtime = workersCapacitor({
  baseURL: "https://local.invalid/",
  prefer: "worker", // local function-bearing env selects direct execution
  env: { SETTINGS: kv.api }, // use the binding name declared in Wrangler
  remote: {
    origin: "https://your-existing-worker.example",
    getToken: () => existingSession.accessToken,
    maxBufferedBodyBytes: 8 * 1024 * 1024,
  },
});
```

Selected requests go to this origin with the original path, query, method and
body before local execution. Explicitly permitted independent routes may remain local. If partitioning
cannot be proven safe, the entire Worker is dispatched remotely. Inspect
`workers-capacitor-server.json` for that decision. Wrangler Queue consumer
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

## Verification

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

## Platform references

- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [Cloud KV behavior](https://developers.cloudflare.com/kv/concepts/how-kv-works/)
- [Service HTTP](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/)
- [Service RPC](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/)
- [Queue delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)
