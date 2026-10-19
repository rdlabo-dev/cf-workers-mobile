# Feature contracts and lifecycle

`index.ts` defines typed feature identities, implementation coverage and scoped
resource lifetime. `testing.ts` runs shared contracts and reports results. The
lifecycle host is also usable outside tests.

This infrastructure has no Fetch, KV or Cloudflare-specific behavior. Concrete
adapters and contracts live with their owning implementation:

- Fetch runtime: `src/cloudflare/workers/feature.ts` and `contract.ts`.
- Local KV: `src/cloudflare/bindings/kv/`, including `contract.ts`.
- API modules: adjacent module-owned contracts under `compat` and `browser`.

Public `workers-capacitor/shared/contracts` and `workers-capacitor/shared/contracts/testing`
resolve here. Imports use these role-based paths; old `features` and `testing`
entry points are removed before release. See [the contract standard](../../../docs/contracts.md).
