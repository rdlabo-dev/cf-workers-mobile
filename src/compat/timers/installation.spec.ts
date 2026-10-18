import { describe, expect, it } from "vitest";
import * as timers from "node:timers";
import { installTimerGlobals } from "./installation.js";
describe("timer global ownership", () => {
  it("restores accessors and descriptors only after the final owner", () => {
    const target = {};
    Object.defineProperty(target, "setTimeout", {
      get: () => "original",
      configurable: true,
      enumerable: true,
    });
    const before = Object.getOwnPropertyDescriptors(target);
    const first = installTimerGlobals(target),
      second = installTimerGlobals(target);
    expect(Reflect.get(target, "setTimeout")).toBe(timers.setTimeout);
    first();
    first();
    expect(Reflect.get(target, "setTimeout")).toBe(timers.setTimeout);
    second();
    expect(Object.getOwnPropertyDescriptors(target)).toEqual(before);
  });
  it("preserves application replacement and rejects conflicting owners", () => {
    const target: Record<string, unknown> = {};
    const release = installTimerGlobals(target);
    const replacement = () => {};
    target.setInterval = replacement;
    expect(() => installTimerGlobals(target)).toThrow("setInterval changed");
    release();
    expect(target.setInterval).toBe(replacement);
    expect(target.setTimeout).toBeUndefined();
  });
  it("rolls back if any timer cannot be installed", () => {
    const target = {};
    Object.defineProperty(target, "clearInterval", {
      value: () => {},
      configurable: false,
    });
    const before = Object.getOwnPropertyDescriptors(target);
    expect(() => installTimerGlobals(target)).toThrow();
    expect(Object.getOwnPropertyDescriptors(target)).toEqual(before);
  });
});
