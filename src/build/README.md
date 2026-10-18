# Build integration

This folder owns source analysis, transformation and generated build artifacts.
Vite and esbuild share these helpers rather than keeping independent routing rules.

- `shared.ts`: module aliases and runtime entry locations.
- `server.ts` / `server-modules.ts`: remote dependency analysis and application-code exclusion.
- `documents.ts`: document asset discovery and build output.
- `async.ts`: async context transformation.

Cloudflare declaration parsing and execution policy live in
`src/cloudflare/bindings/config.ts`, where the binding rules are maintained.
Application execution lives in `src/runtime`; reusable API behavior lives in
`src/compat`, `src/browser` and `src/cloudflare/apis`.
