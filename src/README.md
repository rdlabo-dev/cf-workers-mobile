# Source roles

The core runtime and API implementations are organized by responsibility:

```text
compat/                 Workers-compatible Node.js modules
browser/                Browser APIs, document hosting and Worker isolation
  documents/            DOM rendering, hosting and service-worker assets
  isolated/             Dedicated Worker execution and transport
cloudflare/
  apis/                 Cloudflare-specific runtime modules
  bindings/             Local KV, binding configuration and HTTP dispatch
  workers/              Workers handler invocation and execution selection
tooling/                Source analysis, transformation and bundler support
shared/                 Cross-domain initialization, codecs and wire helpers
  contracts/            Typed feature definitions, lifecycle and contract runner
```

- [Node compatibility](compat/README.md) and [browser APIs](browser/README.md) own API behavior.
- [Cloudflare](cloudflare/README.md) separates local APIs from remote services.
- [Workers execution](cloudflare/workers/README.md) coordinates request execution across direct, Worker and remote paths.
- [Tooling](tooling/README.md) owns compile-time discovery and generated bundles.
- [Contracts](shared/contracts/README.md) provides reusable feature/lifecycle/testing infrastructure.
- [Shared](shared/README.md) contains only concrete dependencies used across domains.

The package root integrates installation and rendering. Other public entry points
follow these roles: `tooling/vite`, `tooling/esbuild`, `shared/contracts`, `shared/contracts/testing`,
`cloudflare/workers`, `cloudflare/workers/testing`, `cloudflare/bindings/kv`,
`cloudflare/bindings/kv/testing`, `cloudflare/apis/types`, and `browser/isolated`.
`environment` exposes host detection. This package is unreleased; old subpaths
are removed rather than retained as compatibility aliases.

Folder presence does not establish complete API support; see the
[support map](../docs/api-support.md).
