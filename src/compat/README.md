# Node.js compatibility

`compat` refers specifically to Workers Node.js compatibility. This folder owns
`node:*` module implementations and Node-specific globals. Browser and Workers
APIs are peer folders, not children of this directory.
The target is the Node API behavior exposed by the pinned Workers baseline,
not every API of a standalone Node process.

The [Node compatibility inventory](../../docs/node-compatibility-inventory.md)
is the authoritative per-module status and acceptance record. Contracts remain
beside implementations. Moving a module here does not promote its status.

`immediate` implements Node's setImmediate/clearImmediate; `stream-web` is the
`node:stream/web` export adapter even though its underlying APIs are Web standard.
`cloudflare:node` belongs in [workers](../workers/README.md) because it is a
Cloudflare-owned module bridging Node HTTP and Workers execution.
