# Source roles

The core runtime and API implementations are organized by responsibility:

```text
compat/                 Workers-compatible Node.js modules
browser/                Browser APIs and Workers behavior adaptations
cloudflare/
  apis/                 Cloudflare-specific runtime modules
  bindings/             Local KV, binding configuration and HTTP dispatch
runtime/
  fetch/                Application request execution and Fetch adapter
  isolated/             Dedicated Worker execution and transport
  documents/            Document hosting and execution
build/                  Source analysis, transformation and bundler support
contracts/              Typed feature definitions, lifecycle and contract runner
shared/                 Cross-domain initialization, codecs and wire helpers
```

- [Node compatibility](compat/README.md) and [browser APIs](browser/README.md) own API behavior.
- [Cloudflare](cloudflare/README.md) separates local APIs from remote services.
- [Runtime](runtime/README.md) owns application execution, isolation and document lifetimes.
- [Build](build/README.md) owns compile-time discovery and generated bundles.
- [Contracts](contracts/README.md) provides reusable feature/lifecycle/testing infrastructure.
- [Shared](shared/README.md) contains only concrete dependencies used across domains.

Root modules remain package entry points and integration boundaries. Public
`features/*`, `testing/*`, `worker`, `vite` and `esbuild` subpaths stay stable while
package exports point to the new compiled locations. Folder presence does not
establish complete API support; see the [support map](../docs/api-support.md).
