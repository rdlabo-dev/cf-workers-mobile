import { describe, expect, it } from "vitest";
import { Buffer, global, installNodeGlobals, process } from "./index.js";

describe("Node global installation", () => {
  it("installs matching globals and removes owned values", () => {
    const target = {} as typeof globalThis & Record<string, unknown>;
    const release = installNodeGlobals(target);

    expect(target.Buffer).toBe(Buffer);
    expect(target.process).toBe(process);
    expect(target.global).toBe(global);
    expect(Object.keys(target)).toEqual([
      "Buffer",
      "process",
      "global",
      "setImmediate",
      "clearImmediate",
    ]);
    expect(Object.getOwnPropertyDescriptor(target, "Buffer")).toEqual({
      configurable: true,
      enumerable: true,
      writable: true,
      value: Buffer,
    });

    release();
    expect(Reflect.ownKeys(target)).toEqual([]);
    release();
  });

  it("retains installed globals until every overlapping owner releases", () => {
    const target = {} as typeof globalThis & Record<string, unknown>;
    const releaseFirst = installNodeGlobals(target);
    const releaseSecond = installNodeGlobals(target);

    releaseFirst();
    expect(target.Buffer).toBe(Buffer);
    expect(target.process).toBe(process);
    expect(target.global).toBe(global);

    releaseSecond();
    expect(Reflect.ownKeys(target)).toEqual([]);
  });

  it("rejects a new owner after an installed global is replaced", () => {
    const target = {} as typeof globalThis & Record<string, unknown>;
    const replacement = class Replacement {};
    const release = installNodeGlobals(target);
    Reflect.set(target, "Buffer", replacement);

    expect(() => installNodeGlobals(target)).toThrow(
      "Cannot install Node global Buffer: existing value is incompatible.",
    );
    release();
    expect(target.Buffer).toBe(replacement);
    expect(Object.hasOwn(target, "process")).toBe(false);
    expect(Object.hasOwn(target, "global")).toBe(false);
  });

  it("rolls back a partial installation and permits a clean retry", () => {
    const backing = {} as typeof globalThis & Record<string, unknown>;
    let rejectProcess = true;
    const target = new Proxy(backing, {
      defineProperty(object, name, descriptor) {
        if (name === "process" && rejectProcess)
          throw new Error("process rejected");
        return Reflect.defineProperty(object, name, descriptor);
      },
    });

    expect(() => installNodeGlobals(target)).toThrow("process rejected");
    expect(Reflect.ownKeys(backing)).toEqual([]);

    rejectProcess = false;
    const release = installNodeGlobals(target);
    expect(target.Buffer).toBe(Buffer);
    expect(target.process).toBe(process);
    expect(target.global).toBe(global);
    release();
    expect(Reflect.ownKeys(backing)).toEqual([]);
  });

  it("rejects incompatible foreign globals without changing them", () => {
    const hostProcess = { env: { HOST: "true" } };
    const target = Object.create({ global: "inherited" }) as typeof globalThis &
      Record<string, unknown>;
    Object.defineProperty(target, "process", {
      configurable: true,
      enumerable: true,
      writable: false,
      value: hostProcess,
    });

    expect(() => installNodeGlobals(target)).toThrow(
      "Cannot install Node global process: existing value is incompatible.",
    );
    expect(target.process).toBe(hostProcess);
    expect(target.global).toBe("inherited");
    expect(Object.hasOwn(target, "Buffer")).toBe(false);
    expect(Object.hasOwn(target, "global")).toBe(false);
  });

  it("preserves an owned global replaced before release", () => {
    const target = {} as typeof globalThis & Record<string, unknown>;
    const replacement = class Replacement {};
    const release = installNodeGlobals(target);

    Reflect.set(target, "Buffer", replacement);
    release();
    expect(target.Buffer).toBe(replacement);
    expect(Object.hasOwn(target, "process")).toBe(false);
    expect(Object.hasOwn(target, "global")).toBe(false);
  });
});
