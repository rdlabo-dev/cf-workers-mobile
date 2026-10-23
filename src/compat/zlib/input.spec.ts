import { expect, test } from "vitest";
import { bindingBuffers, nativeNumber } from "./input.js";

test("codec input bounds reject lengths larger than the intrinsic view", () => {
  const input = new Uint8Array([65]);
  Object.defineProperty(input, "byteLength", { value: 32 });
  expect(() =>
    bindingBuffers("ZlibContext", input, 0, 32, new Uint8Array(64), 0, 64),
  ).toThrow("Input access is not within bounds");
  expect(
    bindingBuffers("ZlibContext", input, 0, 0, new Uint8Array(64), 0, 64)
      .inputLength,
  ).toBe(0);
});

test("codec bounds cover output extents and uint32 addition overflow", () => {
  const input = new Uint8Array(1),
    output = new Uint8Array(1);
  Object.defineProperty(output, "byteLength", { value: 64 });
  expect(() =>
    bindingBuffers("ZlibContext", input, 0, 1, output, 0, 64),
  ).toThrow("Output access is not within bounds");
  expect(() =>
    bindingBuffers("ZlibContext", input, 4294967295, 1, output, 0, 1),
  ).toThrow("Input access is not within bounds");
  expect(() =>
    bindingBuffers("ZlibContext", input, 0, 1, output, 4294967295, 1),
  ).toThrow("Output access is not within bounds");
});

test("codec buffer conversion validates brands before accessing native memory", () => {
  const output = new Uint8Array(1);
  expect(() => bindingBuffers("ZlibContext", {}, 0, 1, output, 0, 1)).toThrow(
    TypeError,
  );
  expect(() => bindingBuffers("ZlibContext", output, 0, 1, {}, 0, 1)).toThrow(
    TypeError,
  );
  for (const length of [-1, NaN, Infinity, 4294967296])
    expect(() =>
      bindingBuffers("ZlibContext", output, 0, length, output, 0, 1),
    ).toThrow(TypeError);
});

test("native numeric conversion rejects BigInt without repeated coercion", () => {
  let reads = 0;
  const object = {
    valueOf() {
      reads++;
      return 0n;
    },
  };
  for (const value of [
    0n,
    object,
    {
      [Symbol.toPrimitive]() {
        return 0n;
      },
    },
  ])
    expect(() => nativeNumber(value)).toThrow(
      "Cannot convert a BigInt value to a number",
    );
  expect(reads).toBe(1);
  expect(() => nativeNumber(Symbol())).toThrow(
    "Cannot convert a Symbol value to a number",
  );
  expect(
    nativeNumber({
      valueOf() {
        return "1.5";
      },
    }),
  ).toBe(1.5);
});
