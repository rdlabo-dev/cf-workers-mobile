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
    const options = {
      baseURL: "https://worker.invalid",
      worker: { fetch: () => new Response("native") },
    };
    const app = create(options);
    await app.ready;
    expect(await (await fetch(options.baseURL)).text()).toBe("native");
    expect(() => create(options)).toThrow("already installed");
    const close = host.__workersNativeDispose!;
    await close();
    expect(host.__workersNativeDispose).toBeUndefined();
    expect(globalThis.fetch).toBe(originalFetch);
    const reopened = create(options);
    await reopened.ready;
    // A late callback from the previous host cannot dispose the new host.
    await close();
    expect(host.__workersNativeDispose).toBe(reopened.dispose);
    await reopened.dispose();
  },
);

it("rolls back a failed startup before a replacement runtime starts", async () => {
  const failed = vi.fn(() => {
    expect(host.__workersNativeDispose).toBeUndefined();
    expect(globalThis.fetch).toBe(originalFetch);
  });
  vi.stubGlobal("WorkersNativeHost", { failed });
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
