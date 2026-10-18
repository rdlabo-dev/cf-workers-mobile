# Upstream notices

The net facade, internal implementation, logical port table, error classes and
validators are adapted from Cloudflare workerd tag `v1.20261012.1`:

- `src/node/net.ts`
- `src/node/internal/internal_net.ts`
- `src/node/internal/internal_errors.ts` (required declarations only)
- `src/node/internal/validators.ts` (required declarations only)
- `src/cloudflare/internal/http.ts`

Copyright Cloudflare, Inc.; Apache License 2.0. Node.js/Joyent and Deno MIT
notices are retained in the corresponding source files. Host transport and
module imports are adapted for Capacitor. Public exports remain those of the
pinned workerd module; internal helpers are not added to the public facade.
