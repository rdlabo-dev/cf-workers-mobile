import { describe, expect, it } from "vitest";
import * as URLs from "node:url";
import { installUrlGlobals } from "./installation.js";
describe("URL global ownership", () => {
  it("restores accessors and descriptors only after the final owner", () => {
    const target = {};
    Object.defineProperty(target, "URL", {
      get: () => "original",
      configurable: true,
      enumerable: true,
    });
    const before = Object.getOwnPropertyDescriptors(target);
    const first = installUrlGlobals(target),
      second = installUrlGlobals(target);
    expect(Reflect.get(target, "URL")).toBe(URLs.URL);
    first();
    first();
    expect(Reflect.get(target, "URL")).toBe(URLs.URL);
    second();
    expect(Object.getOwnPropertyDescriptors(target)).toEqual(before);
  });
  it("preserves application replacement and rejects conflicting owners", () => {
    const target: Record<string, unknown> = {};
    const release = installUrlGlobals(target);
    const replacement = () => {};
    target.URL = replacement;
    expect(() => installUrlGlobals(target)).toThrow("URL changed");
    release();
    expect(target.URL).toBe(replacement);
  });
  it("rolls back if any URL cannot be installed", () => {
    const target = {};
    Object.defineProperty(target, "URL", {
      value: () => {},
      configurable: false,
    });
    const before = Object.getOwnPropertyDescriptors(target);
    expect(() => installUrlGlobals(target)).toThrow();
    expect(Object.getOwnPropertyDescriptors(target)).toEqual(before);
  });
});
