# Workers assertion adapter

The implementation and comparison algorithm come from workerd
`5358e3d337336eaf696a48bc1563d808b10feba5`, with the date `2026-10-17` and no
additional compatibility flags. `equal` is strict in that profile, and
`assert/strict` re-exports the same default object as `assert`.

`index.spec.ts` compares ordinary assertion behavior, exception metadata,
collections, binary data, cyclic objects, asynchronous rejection handling and
generated diffs with that runtime. A CommonJS entry preserves callable
`require("node:assert")`; its integration fixture is in the demo's tests.

This is still a development candidate. The browser formatter used for generated
errors cannot access V8's Proxy targets, synchronous Promise state, or hidden
weak-collection/iterator entries. It explicitly rejects Promise-state and hidden
entry inspection instead of inventing values or consuming iterators. Proxy
inspection cannot avoid user traps in this implementation. The private type
recognizers for engine-only brands are inspection fallbacks, not a certified
`node:util/types` implementation. These limits need capability contracts before
whole-module acceptance. Engine-specific stack strings are not normalized.
