// The oracle and browser runners share these assertions; they do not depend
// on the node:assert module whose compatibility has not yet been certified.
export function strictEqual(
  actual: unknown,
  expected: unknown,
  message?: string,
) {
  if (!Object.is(actual, expected))
    throw new Error(
      message ?? `Expected ${String(expected)}, got ${String(actual)}`,
    );
}
export function deepStrictEqual(
  actual: any,
  expected: any,
  message?: string,
): void {
  if (Object.is(actual, expected)) return;
  if (
    !actual ||
    !expected ||
    typeof actual !== "object" ||
    typeof expected !== "object"
  )
    strictEqual(actual, expected, message);
  strictEqual(
    Object.getPrototypeOf(actual),
    Object.getPrototypeOf(expected),
    message,
  );
  const a = Reflect.ownKeys(actual),
    b = Reflect.ownKeys(expected);
  strictEqual(a.length, b.length, message);
  for (const key of a) {
    if (!b.includes(key)) throw new Error(`Missing key ${String(key)}`);
    deepStrictEqual(actual[key], expected[key], message);
  }
}
export function match(actual: string, expected: RegExp) {
  if (!expected.test(actual))
    throw new Error(`${actual} does not match ${expected}`);
}
export function throws(
  fn: () => unknown,
  expected?: any,
  message?: string,
): void {
  try {
    fn();
  } catch (e: any) {
    if (expected instanceof RegExp) match(String(e), expected);
    else if (typeof expected === "function") {
      if (expected.prototype instanceof Error || expected === Error) {
        if (!(e instanceof expected)) throw e;
      } else if (expected(e) !== true) throw e;
    } else if (expected && typeof expected === "object")
      for (const key of Object.keys(expected)) {
        if (expected[key] instanceof RegExp) match(e[key], expected[key]);
        else strictEqual(e[key], expected[key]);
      }
    return;
  }
  throw new Error(message ?? "Expected exception");
}
function ok(value: unknown, message?: string): asserts value {
  if (!value) throw new Error(message ?? "Expected truthy value");
}
export default Object.assign(ok, {
  strictEqual,
  deepStrictEqual,
  throws,
  notStrictEqual(a: unknown, b: unknown) {
    if (Object.is(a, b)) throw new Error("Expected different values");
  },
});
