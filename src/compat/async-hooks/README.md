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

Whole-module acceptance remains open. Capacitor builds lower async functions and
generators, then capture Promise continuations. The shared contract now covers
settle restoration, nested asynchronous scopes and concurrent isolation, in
addition to the pinned Workers stubs. Native async callbacks that bypass the
build plugin are rejected rather than silently leaking another scope's store.

The adapter does not implement workerd's request-origin guard on captured
contexts. Matching exports and the ordinary continuation contracts do not prove
full engine equivalence. The experiments under demo/tests/experiments/node-compat
document the remaining native-promise and scheduling boundaries.
