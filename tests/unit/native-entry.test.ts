import { afterEach, expect, it, vi } from "vitest";
import { workersIOS } from "../../src/ios.js";
import { workersAndroid } from "../../src/android.js";

const host = globalThis as typeof globalThis & {
  __workersNativeDispose?: () => Promise<void>;
};
const originalFetch = globalThis.fetch;
afterEach(async () => {
  await host.__workersNativeDispose?.();
  expect(globalThis.fetch).toBe(originalFetch);
  vi.unstubAllGlobals();
});

it.each([workersIOS, workersAndroid])(
  "allows native close to release the runtime and permits reopening",
  async (create) => {
    const ready = vi.fn();
    vi.stubGlobal("WorkersNativeHost", { ready, failed: vi.fn() });
    const options = {
      baseURL: "https://worker.invalid",
      worker: { fetch: () => new Response("native") },
    };
    const app = create(options);
    expect(ready).not.toHaveBeenCalled();
    await app.ready;
    expect(ready).toHaveBeenCalledOnce();
    expect(await (await fetch(options.baseURL)).text()).toBe("native");
    expect(() => create(options)).toThrow("already installed");
    const close = host.__workersNativeDispose!;
    await close();
    expect(host.__workersNativeDispose).toBeUndefined();
    expect(globalThis.fetch).toBe(originalFetch);
    const reopened = create(options);
    await reopened.ready;
    expect(ready).toHaveBeenCalledTimes(2);
    // A late callback from the previous host cannot dispose the new host.
    await close();
    expect(host.__workersNativeDispose).toBe(reopened.dispose);
    await reopened.dispose();
  },
);

it("rolls back a failed startup before a replacement runtime starts", async () => {
  const ready = vi.fn();
  const failed = vi.fn(() => {
    expect(host.__workersNativeDispose).toBeUndefined();
    expect(globalThis.fetch).toBe(originalFetch);
  });
  vi.stubGlobal("WorkersNativeHost", { ready, failed });
  const app = workersIOS({
    baseURL: "https://worker.invalid",
    prefer: "direct",
    worker: {
      createWorker: () => {
        throw new Error("must use direct execution");
      },
      loadDirect: async () => {
        throw new Error("broken worker");
      },
    },
  });
  await expect(app.ready).rejects.toThrow("broken worker");
  expect(failed).toHaveBeenCalledWith("broken worker");
  expect(ready).not.toHaveBeenCalled();
  expect(host.__workersNativeDispose).toBeUndefined();
  expect(globalThis.fetch).toBe(originalFetch);
  const replacement = workersAndroid({
    baseURL: "https://worker.invalid",
    worker: { fetch: () => new Response("replacement") },
  });
  await replacement.ready;
  await replacement.dispose();
});

it("reports synchronous startup failure without replacing the original error", () => {
  const failed = vi.fn(() => {
    throw new Error("native reporting failed");
  });
  vi.stubGlobal("WorkersNativeHost", { failed });
  expect(() => workersIOS({ baseURL: "https://worker.invalid" })).toThrow(
    "No Worker configured",
  );
  expect(failed).toHaveBeenCalledOnce();
  expect(host.__workersNativeDispose).toBeUndefined();
});

it("does not notify a closed host when its pending startup settles", async () => {
  const ready = vi.fn();
  const failed = vi.fn();
  vi.stubGlobal("WorkersNativeHost", { ready, failed });
  let load!: (worker: { fetch(): Response }) => void;
  const loading = new Promise<{ fetch(): Response }>((resolve) => {
    load = resolve;
  });
  const app = workersIOS({
    baseURL: "https://worker.invalid",
    prefer: "direct",
    worker: {
      createWorker: () => {
        throw new Error("must use direct execution");
      },
      loadDirect: () => loading,
    },
  });
  const rejected = expect(app.ready).rejects.toThrow("Worker runtime disposed");
  const closed = app.dispose();
  load({ fetch: () => new Response("late") });
  await closed;
  await rejected;
  expect(ready).not.toHaveBeenCalled();
  expect(failed).not.toHaveBeenCalled();
  expect(host.__workersNativeDispose).toBeUndefined();
});
