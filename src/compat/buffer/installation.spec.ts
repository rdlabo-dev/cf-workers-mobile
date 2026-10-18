import { describe, expect, it, vi } from "vitest";
import { Blob, File } from "./blob.js";
import { installWebGlobals } from "../../shared/globals/web.js";
for (const [name, installed] of Object.entries({ Blob, File }))
  describe(`${name} ownership`, () => {
    it("restores original descriptors after the final owner", () => {
      const target = {};
      const get = () => globalThis[name as "Blob" | "File"];
      Object.defineProperty(target, name, {
        get,
        configurable: true,
        enumerable: false,
      });
      const before = Object.getOwnPropertyDescriptors(target);
      const first = installWebGlobals(target),
        second = installWebGlobals(target);
      expect(Reflect.get(target, name)).toBe(installed);
      first();
      first();
      expect(Reflect.get(target, name)).toBe(installed);
      second();
      expect(Object.getOwnPropertyDescriptors(target)).toEqual(before);
    });
    it("rejects conflicting owners without overwriting application changes", () => {
      const target: Record<string, unknown> = {};
      const release = installWebGlobals(target);
      const replacement = () => {};
      target[name] = replacement;
      expect(() => installWebGlobals(target)).toThrow(`${name} changed`);
      release();
      expect(target[name]).toBe(replacement);
      const locked = {};
      Object.defineProperty(locked, name, {
        value: replacement,
        configurable: false,
      });
      const before = Object.getOwnPropertyDescriptors(locked);
      expect(() => installWebGlobals(locked)).toThrow();
      expect(Object.getOwnPropertyDescriptors(locked)).toEqual(before);
    });
  });

it("recovers host constructors when another bundle loads after installation", async () => {
  const restore = installWebGlobals();
  try {
    vi.resetModules();
    const other = await import("./blob.js");
    const blob = new other.Blob(["hello"]);
    const file = new other.File([blob], "test.txt", { lastModified: 12.5 });
    expect(await file.text()).toBe("hello");
    expect(file.lastModified).toBe(12.5);
    expect(file.name).toBe("test.txt");
    const original = new Blob(["x"], { type: "a\x7fz" });
    expect(other.cloneBlob(original).type).toBe("a\x7fz");
  } finally {
    restore();
  }
});
