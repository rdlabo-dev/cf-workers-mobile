# Workers Node streams

The implementation follows workerd 1.20261012.1, compatibility date 2026-10-17,
without extra flags. `enable_streams_nodejs_v24_compat` is opt-in at this revision
and is deliberately false. Default byte/object watermarks are 65536/16.

`node:stream`, `stream/promises` and the five constructor submodules share their
implementations. CommonJS returns the default constructor; ESM also exposes the
internal helpers, which are not always the constructor's own static methods.
The build adapters preserve that distinction without overwriting those methods.
The existing resource-symbol adapter handles iOS 26.1's missing asyncDispose.

The pinned runtime rejects iterable `Duplex.from` inputs with ERR_INVALID_ARG_TYPE;
the contract preserves that upstream behavior. This is a development candidate:
Web Stream interop, EventEmitter/process integration and the remaining internal
stream wrapper must be assessed before whole-module acceptance.
