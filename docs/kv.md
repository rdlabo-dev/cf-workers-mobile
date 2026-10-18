# Local KV binding

`LocalStorageKV` implements the `kv.local.v1` profile through the common feature host. The API uses Workers KV method names and overloads. WebView `localStorage` persists each value together with its metadata and expiration. The application chooses a stable namespace; feature disposal never deletes application data.

```ts
import { capacitorWorkers } from "@rdlabo/capacitor-workers";
import { openFeature } from "@rdlabo/capacitor-workers/features";
import { LocalStorageKV } from "@rdlabo/capacitor-workers/features/kv";
import worker from "./worker";

const kv = await openFeature(new LocalStorageKV("my-app-settings"));
const runtime = capacitorWorkers({
  worker,
  baseURL: "https://example.com/api",
  env: { KV: kv.api },
});
// At application shutdown: runtime.dispose(); await kv.dispose();
```

The Worker can type this binding as the exported `KVNamespace`. The same Worker can use an actual Workers KV binding. This setup uses direct execution: function-bearing bindings cannot currently cross the isolated Worker structured-clone boundary. Binding RPC remains a separate transport task; this implementation does not change the common host or runner.

With build-generated remote dispatch, configure every Wrangler KV name through
`kvExecution: { KV: "local" }` or `kvExecution: { KV: "remote" }` in the build
plugin. Missing or invalid policies fail the build. For `local`, supply the
instance through `env` as above; `remote` dispatches KV-only routes to the Worker. If R2 or another server dependency selects a handler for remote
execution, that entire request uses the deployed Worker and its cloud KV. Local
and cloud data remain independent; see the [dispatch guide](remote-service-bindings.md).

## Supported API

| Operation | Behavior |
| --- | --- |
| `get(key, typeOrOptions?)` | Default/explicit text, JSON, ArrayBuffer and byte stream results; missing keys return null |
| `get(keys, typeOrOptions?)` | Up to 100 keys; text or JSON Map results, including null for missing keys |
| `getWithMetadata` | Same single/bulk read modes, with metadata; a missing single read returns `{value: null, metadata: null}`, a missing bulk entry is null |
| `put(key, value, options?)` | String, ArrayBuffer, typed byte views or byte streams; optional JSON metadata and absolute/relative expiration |
| `delete(key)` | Delete value, metadata and expiration together; absent keys are harmless |
| `list(options?)` | UTF-8 key ordering, prefix, limit (1–1000), continuation cursor, metadata and expiration |

`expirationTtl` and future absolute `expiration` have a minimum of 60 seconds. If both are present, TTL selects the resulting expiration. TTL begins after the input has been collected and encoded, immediately before publication. An absolute expiration is validated at invocation and rejected if it has elapsed before publication, preserving any previous value. Expiration is checked on reads and listing, including after a new feature session; an expired record is removed lazily. Overwriting without options removes previous metadata and expiration. Cursors are opaque local tokens bound to the namespace and prefix, not portable to Cloudflare. They resume after the last returned key rather than an array offset; deleting previous entries does not skip the next key. Listing is not a transactional snapshot under concurrent writes.

## Implementation guardrails

Validation is in the binding implementation, independent of tests. Invalid keys, read modes, options, limits, expiration, metadata and bulk modes reject. Keys must be 1–512 UTF-8 bytes excluding `.` and `..`; values are capped at 25 MiB and serialized metadata at 1024 bytes. Browser storage quota can be substantially smaller. A valid `cacheTtl` (at least 30 seconds) is accepted, but no local read cache is introduced. Unknown option fields reject instead of being silently ignored.

Byte streams are collected with an incremental size check before any record is published. Failed/oversized input leaves the old record intact. Value, expiration and metadata are serialized into a single storage write; quota/security failures propagate without a memory fallback. Returned bytes and metadata are independent copies. Missing `localStorage` throws `FeatureUnavailable`; property access errors propagate.

The optional second constructor argument supplies an existing `Storage` backend for deterministic tests. No generic storage registry or persistence lifecycle abstraction is introduced. Runtime checks and backend failure tests remain in `tests/unit/kv.test.ts`.

## Compatibility and persistence boundaries

The exported `kvContract` from `@rdlabo/capacitor-workers/testing/kv` exercises 18 shared behavior cases against the actual local workerd binding and the local adapter. `kvTextContract` remains available for its smaller `kv.text.v1` profile. Contract providers own an empty test namespace and its cleanup; never run them against application data. Expiration boundary and failure-path tests are separate; the workerd suite also waits for a real minimum TTL to elapse.

This profile does not emulate global replication, eventual consistency, regional cache behavior, production rate limits or cloud synchronization. It does not claim identical error wording, distributed ordering or performance. Bulk response size checks are local serialized-result bounds, not a reproduction of Cloudflare's internal wire accounting. The KV API is implemented in TypeScript; it does not embed V8.

Storage belongs to the WebView origin. Clearing app/browser data, uninstalling, eviction or changing origin can lose access to data. No encrypted-secret or OS durability guarantee is made. Web Storage calls are synchronous behind a Promise API; binary values are base64 encoded and streams are buffered, so large values incur memory and quota overhead. The record format uses a versioned storage prefix; no migration from the earlier unpublished text-only prototype is provided.

Native tests use bundled assets in iOS/Android simulator/emulator WebViews. Document reload persistence is additionally verified in Chromium/WebKit. These do not establish physical-device or application-upgrade durability guarantees.

References: Cloudflare [reading KV](https://developers.cloudflare.com/kv/api/read-key-value-pairs/), [writing KV](https://developers.cloudflare.com/kv/api/write-key-value-pairs/) and [listing keys](https://developers.cloudflare.com/kv/api/list-keys/). The missing-entry shape for bulk metadata and preservation of leading U+FEFF in keys are verified against actual workerd. Single-key text reads retain a leading BOM and single-key JSON reads reject BOM-prefixed JSON. Bulk reads strip the BOM, including before JSON parsing; this single/bulk distinction is reproduced and tested for both get and getWithMetadata.
