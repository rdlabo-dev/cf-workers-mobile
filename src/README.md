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

The `ios` and `android` entries add SDK-owned native lifecycle handling to the
shared runtime. The `capacitor` entry exposes the Capacitor and Fetch-only runtime.
There is no bare package-root runtime entry.
See [host selection](../README.md#get-your-app-onto-your-phone). Other public entry points
follow these roles: `tooling/vite`, `tooling/esbuild`, `shared/contracts`, `shared/contracts/testing`,
`cloudflare/workers`, `cloudflare/workers/testing`, `cloudflare/bindings/kv`,
`cloudflare/bindings/kv/testing`, `cloudflare/apis/types`, and `browser/isolated`.
`environment` exposes host detection. The iOS and Android embedding entries are
not included in the earlier `workers-capacitor@0.1.1` Preview. The renamed
`cf-workers-native@0.1.2` Preview includes them; install it once published and
use matching native dependencies.

Folder presence does not establish complete API support; see the
[compatibility limits](../docs/compatibility.md).
