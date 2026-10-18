import { describe, expect, it } from "vitest";
import { installWebGlobals } from "./web.js";
import { Request } from "../request/index.js";
import { Response } from "../response/index.js";
import { Headers } from "../headers/index.js";
import { structuredClone } from "../structured-clone/index.js";
import { platform } from "./platform.js";

describe.each([
  { name: "Request", original: platform.Request, installed: Request },
  { name: "Response", original: platform.Response, installed: Response },
  { name: "Headers", original: platform.Headers, installed: Headers },
  {
    name: "structuredClone",
    original: globalThis.structuredClone,
    installed: structuredClone,
  },
])("$name global wiring", ({ name, original, installed }) => {
  it("restores original accessor and non-enumerable descriptors after the last owner", () => {
    const target = {};
    const get = () => original;
    Object.defineProperty(target, name, {
      get,
      configurable: true,
      enumerable: false,
    });
    const before = Object.getOwnPropertyDescriptors(target);
    const first = installWebGlobals(target);
    const second = installWebGlobals(target);
    expect(Reflect.get(target, name)).toBe(installed);
    first();
    first();
    expect(Reflect.get(target, name)).toBe(installed);
    second();
    expect(Object.getOwnPropertyDescriptors(target)).toEqual(before);
  });
  it("preserves an application replacement and rejects another owner", () => {
    const target: Record<string, unknown> = {};
    const release = installWebGlobals(target);
    const replacement = () => {};
    target[name] = replacement;
    expect(() => installWebGlobals(target)).toThrow(
      `${name} changed during installation`,
    );
    release();
    expect(target[name]).toBe(replacement);
    expect(Object.getOwnPropertyNames(target)).toEqual([name]);
  });
});
it("rolls back earlier changes if a later global is non-configurable", () => {
  const target = { Request: platform.Request };
  Object.defineProperty(target, "Headers", {
    value: platform.Headers,
    configurable: false,
  });
  const before = Object.getOwnPropertyDescriptors(target);
  expect(() => installWebGlobals(target)).toThrow();
  expect(Object.getOwnPropertyDescriptors(target)).toEqual(before);
});
it("owns and restores a missing resource-management symbol alongside Web globals", () => {
  const symbol = {};
  const target = { Symbol: symbol };
  const first = installWebGlobals(target);
  const installed = Object.getOwnPropertyDescriptor(symbol, "asyncDispose");
  expect(typeof installed?.value).toBe("symbol");
  expect(typeof Object.getOwnPropertyDescriptor(symbol, "dispose")?.value).toBe(
    "symbol",
  );
  const second = installWebGlobals(target);
  first();
  expect(Object.getOwnPropertyDescriptor(symbol, "asyncDispose")).toEqual(
    installed,
  );
  second();
  expect(Object.hasOwn(symbol, "asyncDispose")).toBe(false);
  expect(Object.hasOwn(symbol, "dispose")).toBe(false);
});

it("rejects a new owner after the AbortSignal constructor is replaced", () => {
  class Original {
    static timeout = () => "original";
  }
  class Replacement {
    static timeout = () => "replacement";
  }
  const originalTimeout = Original.timeout;
  const replacementTimeout = Replacement.timeout;
  const target = { AbortSignal: Original } as Record<string, unknown>;
  const release = installWebGlobals(target);
  target.AbortSignal = Replacement;
  expect(() => installWebGlobals(target)).toThrow(
    "AbortSignal constructor changed",
  );
  expect(Replacement.timeout).toBe(replacementTimeout);
  release();
  expect(target.AbortSignal).toBe(Replacement);
  expect(Original.timeout).toBe(originalTimeout);
});
