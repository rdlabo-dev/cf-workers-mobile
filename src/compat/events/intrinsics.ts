// Native intrinsic discovery must survive the ordinary async lowering pipeline.
export const AsyncIteratorPrototype = Object.getPrototypeOf(
  Object.getPrototypeOf(async function* () {}).prototype,
);
