# Events in the WebView profile

This adapter targets workerd `1.20261012.1`, compatibility date `2026-10-17`,
through the cf-workers-native Vite and esbuild plugins. It implements the pinned
`events` exports for page and Dedicated Worker execution on Capacitor WebViews.
The WebView profile is an explicitly scoped target; it is not a claim of complete
Workers engine equivalence or complete `process`/`async_hooks` compatibility.

The adapter includes EventEmitter listener ordering, mutation and removal,
listener limits, error monitoring, rejection capture, `once`, async iteration,
abort/disposal helpers and EventEmitterAsyncResource. It preserves Workers'
behavior where that differs from desktop Node: EventTarget listener introspection
returns an empty list, and the pinned EventEmitterAsyncResource `emit` returns
true even when no listener exists. Options unsupported by the pinned Workers
implementation do not acquire desktop Node behavior here.

`process` event delivery, `emitWarning` and `nextTick` are shared with the adapter.
A listener-limit warning reaches `process.on("warning")` asynchronously, with the
original Error object. `nextTick` uses queueMicrotask as in the pinned workerd
implementation. Other process exports retain the existing dependency polyfill;
this change does not implement a Node operating-system process.

## Profile boundaries

- Application async functions must pass through the supplied build plugins.
  Untransformed native async callbacks do not have Workers' engine context hooks.
  AsyncResource propagation is covered for transformed concurrent listeners.
- Native error stacks, V8 call sites and inspection of hidden Proxy/Promise state
  are host-dependent. WebKit does not implement V8's Error.captureStackTrace.
  Warning delivery is supported; V8 stack inspection is not promised.
- The existing partial process and async-hooks profiles remain visible in the
  repository compatibility inventory. Their missing exports are not hidden by
  events surface alignment.

## Reproduction

Run `npm run build`, then:

```sh
node --test demo/tests/experiments/node-compat/events-baseline.probe.mjs \
  demo/tests/experiments/node-compat/events-surface.probe.mjs \
  demo/tests/experiments/node-compat/events-contracts.probe.mjs
```

The same cases in `index.spec.mjs` run against the pinned workerd and through both
public build plugins in Chromium and WebKit, in page and Dedicated Worker modes.
`observations.spec.mjs` additionally covers abort-listener disposal and Workers
export/default-property behavior. Assertions cover actual behavior, not merely
export presence. Generated evidence belongs under `demo/artifacts/node-inventory`.

The `events-native.mjs` runner uses an independently installed npm tarball,
a Capacitor shell and a local HTTPS report endpoint. It runs the same operation
cases in both execution modes on a simulator/emulator. It verifies every returned
case against workerd and records the compiled source hash and platform. Run it
with `ios <simulator UUID>` or `android <emulator serial>` after running `npm run test:events:native:prepare --prefix demo`.
Then use `npm run test:events:native --prefix demo -- <platform> <device>`.
The preparation step builds and installs a local tarball; it does not publish it.
