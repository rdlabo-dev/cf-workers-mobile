# Build tooling

This folder owns build-time source analysis, transformation and asset generation.
Generated output belongs in `dist`, not in this source folder.
Vite and esbuild share these helpers rather than keeping independent routing rules.

- `vite.ts` / `esbuild.ts`: public bundler plugins (`tooling/vite`, `tooling/esbuild`).
- `shared.ts`: module aliases and runtime entry locations.
- `server.ts` / `server-modules.ts`: remote dependency analysis and application-code exclusion.
- `documents.ts`: document asset discovery and build output.
- `async.ts`: async context transformation.

Cloudflare declaration parsing and execution policy live in
`src/cloudflare/bindings/config.ts`, where the binding rules are maintained.
Application execution lives in `src/cloudflare/workers` and browser host mechanisms in `src/browser`; reusable API behavior lives in
`src/compat`, `src/browser` and `src/cloudflare/apis`.
