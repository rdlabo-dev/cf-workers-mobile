# Feature contracts and lifecycle

`index.ts` defines typed feature identities, implementation coverage and scoped
resource lifetime. `testing.ts` runs shared contracts and reports results. The
lifecycle host is also usable outside tests.

This infrastructure has no Fetch, KV or Cloudflare-specific behavior. Concrete
adapters and contracts live with their owning implementation:

- Fetch runtime: `src/runtime/fetch/feature.ts` and `contract.ts`.
- Local KV: `src/cloudflare/bindings/kv/`, including `contract.ts`.
- API modules: adjacent module-owned contracts under `compat` and `browser`.

Public `@rdlabo/workers-capacitor/features` and `@rdlabo/workers-capacitor/testing`
resolve here. They remain stable package entry points; source folder names do not
require consumer import changes. See [the contract standard](../../docs/feature-standard.md).
