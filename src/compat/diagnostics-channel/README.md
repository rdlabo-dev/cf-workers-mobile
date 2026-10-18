# Workers diagnostics channels

Targets workerd 1.20261012.1 and compatibility date 2026-10-17. The tracing
facade follows the pinned TypeScript source; the channel registry translates
the native ordered tables, snapshots, subscriber receivers and name conversion.
The registry retains channels for the lifetime of the module, as Workers does.
Store bindings retain weak references to AsyncLocalStorage instances.

Synchronous publication and tracing have shared contracts against workerd.
Full asynchronous store propagation inherits the async-hooks engine boundary;
this candidate is not accepted as a complete module. Publishing to Cloudflare
Tail Workers is a remote service integration, outside the local event registry.
