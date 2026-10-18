# Workers async hooks adapter

Targets workerd 1.20261012.1, compatibility date 2026-10-17, without extra flags.
The public hook functions are Workers stubs: IDs and provider constants are
zero, createHook callbacks never run, and executionAsyncResource returns a fresh
empty object with no prototype. These are tested behaviors, not placeholders.

AsyncLocalStorage.enterWith and disable throw the same unimplemented errors as
Workers. Constructor options, default values, explicit undefined scopes,
callback receivers, AsyncResource binding metadata and destroy results have
shared contracts against workerd. The oracle no longer excludes these APIs
because an older local implementation implemented desktop Node behavior.

Whole-module acceptance remains open. Native async continuations cannot be
intercepted by replacing Promise.prototype.then. The current context adapter
retains its documented sticky approximation and explicitly excludes restoration
and concurrent-isolation contracts. It also does not implement workerd's
request-origin guard on captured contexts. Neither limitation is hidden by the
matching export namespace. The engine and async-transform experiments under
demo/tests/experiments/node-compat document the tested boundary; ordinary async
lowering is not an exact replacement for native await semantics.
