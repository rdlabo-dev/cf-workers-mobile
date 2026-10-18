import { expect, it } from "vitest";
import { installWebGlobals } from "../globals/web.js";

it("owns the AbortSignal timeout method without replacing native branding", async () => {
  const constructor = globalThis.AbortSignal;
  const previous = Object.getOwnPropertyDescriptor(constructor, "timeout");
  const first = installWebGlobals();
  const second = installWebGlobals();
  try {
    expect(globalThis.AbortSignal).toBe(constructor);
    const signal = AbortSignal.timeout(-1);
    expect(signal).toBeInstanceOf(constructor);
    expect(signal.constructor).toBe(constructor);
    await new Promise<void>((resolve) =>
      signal.addEventListener("abort", () => resolve(), { once: true }),
    );
    expect(signal.reason.name).toBe("TimeoutError");
    first();
    expect(
      Object.getOwnPropertyDescriptor(constructor, "timeout")?.value,
    ).not.toBe(previous?.value);
  } finally {
    first();
    second();
  }
  expect(Object.getOwnPropertyDescriptor(constructor, "timeout")).toEqual(
    previous,
  );
});

it("preserves a later app timeout replacement and rejects another owner", () => {
  const constructor = globalThis.AbortSignal;
  const previous = Object.getOwnPropertyDescriptor(constructor, "timeout")!;
  const release = installWebGlobals();
  const replacement = () => new AbortController().signal;
  try {
    Object.defineProperty(constructor, "timeout", {
      ...previous,
      value: replacement,
    });
    expect(() => installWebGlobals()).toThrow("AbortSignal.timeout changed");
    release();
    expect(constructor.timeout).toBe(replacement);
  } finally {
    release();
    Object.defineProperty(constructor, "timeout", previous);
  }
});
