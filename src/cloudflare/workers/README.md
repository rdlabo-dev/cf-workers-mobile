# Workers handler execution

This folder owns the Workers `fetch(request, env, ctx)` execution model: request
matching, direct/Worker/remote selection, `waitUntil`, background work and disposal.
It integrates browser APIs, Capacitor networking and Cloudflare remote dispatch.
It does not implement the standard Fetch API or deploy Cloudflare Workers.

`feature.ts` connects execution to the reusable contract host; `contract.ts` owns
the portable HTTP behavior profile and fixture. Public entry points are `cloudflare/workers` and
`cloudflare/workers/testing`.

[Browser isolation](../../browser/isolated/README.md) supplies Dedicated Worker
and MessageChannel transport; [documents](../../browser/documents/README.md) owns
DOM rendering and service-worker hosting. Standard Fetch API behavior remains in
`src/browser/fetch`; cloud resource dispatch stays in `src/cloudflare/bindings`.
