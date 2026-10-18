import { expect, it, vi } from "vitest";
it("retains contexts from an earlier bundle after a second ALS module loads", async () => {
  const first = await import("./index.js");
  const a = new first.AsyncLocalStorage<string>();
  vi.resetModules();
  const second = await import("./index.js");
  expect(second.AsyncLocalStorage).not.toBe(first.AsyncLocalStorage);
  const b = new second.AsyncLocalStorage<string>();
  const timers = await import("../timers/timers.js");
  const observed = await new Promise((resolve) => {
    a.run("first", () =>
      b.run("second", () => {
        timers.setTimeout(() => resolve([a.getStore(), b.getStore()]), 0);
      }),
    );
  });
  expect(observed).toEqual(["first", "second"]);
  expect([a.getStore(), b.getStore()]).toEqual([undefined, undefined]);
});
