import { afterEach, expect, it, vi } from "vitest";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
async function clock() {
  let next = 0;
  const pending = new Map<number, { fn: () => void; delay: number }>();
  vi.stubGlobal("setTimeout", (fn: () => void, delay: number) => {
    const id = ++next;
    pending.set(id, { fn, delay });
    return id;
  });
  vi.stubGlobal("clearTimeout", (id: number) => pending.delete(id));
  const host = await import("./host.js");
  return {
    host,
    pending,
    fire(id: number) {
      const job = pending.get(id)!;
      pending.delete(id);
      job.fn();
    },
  };
}
it("splits long deadlines without firing early and cancels after a chunk", async () => {
  const { host, pending, fire } = await clock();
  let calls = 0;
  const id = host.schedule(() => calls++, 2147483650, [], false);
  expect(pending.get(id)?.delay).toBe(2147483647);
  fire(id);
  expect(calls).toBe(0);
  const [next, job] = [...pending][0]!;
  expect(job.delay).toBe(3);
  host.clear(id, false);
  expect(pending.has(next)).toBe(false);
  expect(calls).toBe(0);
});
it("copies arguments and rearms repeating long timers until cancellation", async () => {
  const { host, pending, fire } = await clock();
  const values: unknown[] = [];
  const args = ["before"];
  const id = host.schedule((v) => values.push(v), 2147483648, args, true);
  args[0] = "after";
  fire(id);
  fire([...pending.keys()][0]!);
  expect(values).toEqual(["before"]);
  expect(pending.size).toBe(1);
  host.clear(id, true);
  expect(pending.size).toBe(0);
});
