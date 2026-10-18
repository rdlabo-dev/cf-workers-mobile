# Upstream notices

The Buffer facade, internal implementation, error classes and encoding helpers are adapted from Cloudflare workerd tag `v1.20261012.1`:

- `src/compat/buffer.ts`
- `src/compat/internal/internal_buffer.ts`
- `src/compat/internal/internal_errors.ts` (required declarations only)
- `src/compat/internal/validators.ts` (required declarations only)
- `src/compat/internal/internal_utils.ts`
- `src/workerd/api/node/buffer.c++` (behavioral reference for Web byte helpers)

Copyright Cloudflare, Inc.; Apache License 2.0. Node.js/Joyent, Deno and Feross Aboukhadijeh MIT
notices are retained in the corresponding source files. Host transport and
module imports are adapted for Capacitor. Public exports remain those of the
pinned workerd module; internal helpers are not added to the public facade.
