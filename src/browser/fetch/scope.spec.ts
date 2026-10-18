import { describe, expect, it, vi } from "vitest";
import { createNetworkScope } from "./scope.js";
import type { NativeCall } from "./native-network.js";

const plugin = "WorkersCapacitor";
describe("native network runtime ownership", () => {
  it("closes a header wait independently of the terminated worker", async () => {
    const native = vi.fn<NativeCall>((_, method) =>
      method === "socketOpen" ? new Promise(() => {}) : Promise.resolve(),
    );
    const scope = createNetworkScope(native);
    const opening = scope.call(plugin, "socketOpen", { id: "owned" });
    const closed = scope.dispose();
    expect(scope.dispose()).toBe(closed);
    await expect(opening).rejects.toThrow("disposed");
    await closed;
    expect(native).toHaveBeenLastCalledWith(plugin, "socketClose", {
      id: "owned",
    });
    await expect(
      scope.call(plugin, "socketOpen", { id: "later" }),
    ).rejects.toThrow("disposed");
    expect(native).toHaveBeenCalledTimes(2);
  });
  it("joins an existing native close instead of accepting a second early acknowledgement", async () => {
    let finish!: () => void;
    const releasing = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let calls = 0;
    const native = vi.fn<NativeCall>((_, method) => {
      if (method !== "socketClose") return Promise.resolve();
      return ++calls === 1 ? releasing : Promise.resolve();
    });
    const scope = createNetworkScope(native);
    await scope.call(plugin, "socketOpen", { id: "closing" });
    const closing = scope
      .call(plugin, "socketClose", { id: "closing" })
      .catch(() => {});
    await vi.waitFor(() => expect(calls).toBe(1));
    const completed = vi.fn();
    const disposal = scope.dispose().then(completed);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(completed).not.toHaveBeenCalled();
    expect(calls).toBe(1);
    finish();
    await Promise.all([closing, disposal]);
    expect(completed).toHaveBeenCalledOnce();
  });

  it("does not allow one runtime to address another runtime's handle", async () => {
    const native = vi.fn<NativeCall>(async () => undefined);
    const first = createNetworkScope(native);
    const second = createNetworkScope(native);
    await first.call(plugin, "socketOpen", { id: "first" });
    await expect(
      second.call(plugin, "socketRead", { id: "first" }),
    ).rejects.toThrow("Unknown");
    await second.dispose();
    expect(native).toHaveBeenCalledTimes(1);
    await first.dispose();
    expect(native).toHaveBeenCalledTimes(2);
  });
  it("releases late registration without delivering its response", async () => {
    let open!: (value: unknown) => void;
    const native = vi.fn<NativeCall>((_, method) =>
      method === "socketOpen"
        ? new Promise((resolve) => {
            open = resolve;
          })
        : Promise.resolve(),
    );
    const scope = createNetworkScope(native);
    const opening = scope.call(plugin, "socketOpen", { id: "late" });
    await scope.dispose();
    await expect(opening).rejects.toThrow("disposed");
    open({ status: 200 });
    await vi.waitFor(() => expect(native).toHaveBeenCalledTimes(3));
  });
  it("releases all handles even when one native close fails", async () => {
    const native = vi.fn<NativeCall>(async (_, method, args) => {
      if (method === "socketClose" && args.id === "bad")
        throw new Error("native cleanup");
    });
    const scope = createNetworkScope(native);
    await scope.call(plugin, "socketOpen", { id: "bad" });
    await scope.call(plugin, "socketOpen", { id: "good" });
    await expect(scope.dispose()).rejects.toThrow(
      "Native network cleanup failed",
    );
    expect(
      native.mock.calls.filter((call) => call[1] === "socketClose"),
    ).toHaveLength(2);
  });
  it("does not retain successfully closed handles until runtime disposal", async () => {
    const native = vi.fn<NativeCall>(async () => undefined);
    const scope = createNetworkScope(native);
    await scope.call(plugin, "socketOpen", { id: "done" });
    await scope.call(plugin, "socketClose", { id: "done" });
    await scope.dispose();
    expect(native).toHaveBeenCalledTimes(2);
  });
});

it("owns all byte handles and closes each independently", async () => {
  const native = vi.fn<NativeCall>(async () => ({}));
  const scope = createNetworkScope(native);
  await scope.call(plugin, "socketOpen", { id: "tcp" });
  await scope.call(plugin, "socketOpen", { id: "http" });
  await expect(scope.call(plugin, "socketOpen", { id: "tcp" })).rejects.toThrow(
    "Duplicate network handle",
  );
  await expect(
    scope.call(plugin, "socketRead", { id: "unknown" }),
  ).rejects.toThrow("Unknown network handle");
  await scope.dispose();
  expect(native).toHaveBeenCalledWith(plugin, "socketClose", { id: "tcp" });
  expect(native).toHaveBeenCalledWith(plugin, "socketClose", { id: "http" });
});

it("closes late TCP registration after explicit cancellation without disposing the runtime", async () => {
  let opened!: (value: unknown) => void;
  const native = vi.fn<NativeCall>(async (_, method) =>
    method === "socketOpen"
      ? new Promise((resolve) => {
          opened = resolve;
        })
      : undefined,
  );
  const scope = createNetworkScope(native);
  const opening = scope.call(plugin, "socketOpen", { id: "late-tcp" });
  const rejected = expect(opening).rejects.toThrow("closed before opening");
  await scope.call(plugin, "socketClose", { id: "late-tcp" });
  opened({});
  await rejected;
  expect(native.mock.calls.map((args) => args[1])).toEqual([
    "socketOpen",
    "socketClose",
    "socketClose",
  ]);
  await scope.dispose();
});
