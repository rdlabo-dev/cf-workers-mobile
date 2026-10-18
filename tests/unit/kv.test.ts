import { expect, it, vi } from "vitest";
import { LocalStorageKV } from "../../src/cloudflare/bindings/kv/index";
import { openFeature } from "../../src/shared/contracts/index";
function storage() {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}
it("preserves data across scopes and implementations without crossing namespaces", async () => {
  const backing = storage();
  const first = await openFeature(new LocalStorageKV('a":b', backing));
  await first.api.put("key", "日本語 🍷");
  await first.dispose();
  const next = await openFeature(new LocalStorageKV('a":b', backing));
  const other = await openFeature(new LocalStorageKV("a", backing));
  expect(await next.api.get("key")).toBe("日本語 🍷");
  expect(await other.api.get("b:key")).toBeNull();
  await other.api.put("key", "other");
  await next.api.delete("key");
  expect(await other.api.get("key")).toBe("other");
  await next.dispose();
  await other.dispose();
});
it("rejects invalid inputs without modifying saved data", async () => {
  const api = new LocalStorageKV("test", storage()).create();
  await api.put("key", "original");
  await expect(api.put("key", "new", { expirationTtl: 59 })).rejects.toThrow(
    "60",
  );
  // @ts-expect-error Unknown options cannot be silently ignored.
  await expect(api.put("key", "new", { unknown: true })).rejects.toThrow(
    "Unsupported",
  );
  // @ts-expect-error Bulk streaming is unsupported by Workers KV.
  await expect(api.get(["key"], "stream")).rejects.toThrow(
    "only text and json",
  );
  expect(await api.get("key")).toBe("original");
});
it("enforces key byte limits and preserves prototype-like keys", async () => {
  const api = new LocalStorageKV("test", storage()).create();
  for (const key of ["", ".", "..", "é".repeat(257)]) {
    await expect(api.put(key, "value")).rejects.toThrow("KV key");
    await expect(api.get(key)).rejects.toThrow("KV key");
    await expect(api.delete(key)).rejects.toThrow("KV key");
  }
  for (const key of ["é".repeat(256), "__proto__", "constructor", "a/b"]) {
    await api.put(key, "value");
    expect(await api.get(key)).toBe("value");
  }
});
it("propagates storage quota and access failures as rejected operations", async () => {
  const error = new DOMException("full", "QuotaExceededError");
  const backing = storage();
  backing.setItem = vi.fn(() => {
    throw error;
  });
  const api = new LocalStorageKV("test", backing).create();
  await expect(api.put("key", "value")).rejects.toBe(error);
  backing.getItem = () => {
    throw error;
  };
  await expect(api.get("key")).rejects.toBe(error);
  backing.removeItem = () => {
    throw error;
  };
  await expect(api.delete("key")).rejects.toBe(error);
});
it("reports unavailable storage without silently using memory", async () => {
  vi.stubGlobal("localStorage", undefined);
  try {
    await expect(openFeature(new LocalStorageKV("test"))).rejects.toThrow(
      "unavailable",
    );
    expect(() => new LocalStorageKV("")).toThrow("namespace");
  } finally {
    vi.unstubAllGlobals();
  }
});
it("rejects oversized writes before changing storage", async () => {
  const backing = storage();
  const api = new LocalStorageKV("test", backing).create();
  await api.put("key", "original");
  await expect(
    api.put("key", "a".repeat(25 * 1024 * 1024 + 1)),
  ).rejects.toThrow("25 MiB");
  expect(await api.get("key")).toBe("original");
});

it("runs the reusable contract against implementations and detects lost writes", async () => {
  const { kvContract } = await import("../../src/cloudflare/bindings/kv/contract");
  const { runContract, assertContract } =
    await import("../../src/shared/contracts/testing");
  class IsolatedKV extends LocalStorageKV {
    constructor() {
      super("contract");
    }
    override create() {
      return new LocalStorageKV("contract", storage()).create();
    }
  }
  const passing = await runContract(new IsolatedKV(), kvContract);
  assertContract(passing);
  expect(passing.cases.every((test) => test.status === "passed")).toBe(true);
  class LostWrites extends IsolatedKV {
    override create() {
      const api = super.create();
      api.put = async () => {};
      return api;
    }
  }
  const failing = await runContract(new LostWrites(), kvContract);
  expect(failing.cases.find((test) => test.id === "roundtrip")?.status).toBe(
    "failed",
  );
  expect(() => assertContract(failing)).toThrow();
});

it("expires values and metadata at the boundary and omits expired list entries", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T00:00:00Z"));
  try {
    const backing = storage();
    const api = new LocalStorageKV("ttl", backing).create();
    await api.put("ttl", "value", { expirationTtl: 60, metadata: { tag: 1 } });
    await api.put("absolute", "value", { expiration: Date.now() / 1000 + 60 });
    await api.put("keep", "old", { expirationTtl: 60 });
    await api.put("keep", "new");
    vi.advanceTimersByTime(59_999);
    expect(await api.get("ttl")).toBe("value");
    vi.advanceTimersByTime(1);
    const recreated = new LocalStorageKV("ttl", backing).create();
    expect(await recreated.getWithMetadata("ttl")).toEqual({
      value: null,
      metadata: null,
    });
    expect(await recreated.get("absolute")).toBeNull();
    expect((await recreated.list()).keys.map((k) => k.name)).toEqual(["keep"]);
  } finally {
    vi.useRealTimers();
  }
});
it("snapshots metadata and byte views without retaining caller mutations", async () => {
  const api = new LocalStorageKV("test", storage()).create();
  const metadata = { tag: "original" };
  const bytes = new Uint8Array([0, 1, 2, 3]);
  await api.put("key", bytes.subarray(1, 3), { metadata });
  bytes.fill(9);
  metadata.tag = "changed";
  const result = await api.getWithMetadata<{ tag: string }>(
    "key",
    "arrayBuffer",
  );
  expect([...new Uint8Array(result.value!)]).toEqual([1, 2]);
  expect(result.metadata).toEqual({ tag: "original" });
  result.metadata!.tag = "mutated";
  expect((await api.getWithMetadata("key")).metadata).toEqual({
    tag: "original",
  });
});
it("rejects invalid limits, expiration, metadata and cache options before committing", async () => {
  const api = new LocalStorageKV("test", storage()).create();
  await api.put("key", "old");
  for (const options of [
    { expirationTtl: NaN },
    { expirationTtl: 60.5 },
    { expiration: 1 },
    { metadata: "é".repeat(600) },
    { metadata: 1n },
  ]) {
    await expect(api.put("key", "new", options)).rejects.toThrow();
  }
  for (const cacheTtl of [29, NaN, Infinity, 30.5])
    await expect(api.get("key", { cacheTtl })).rejects.toThrow();
  for (const limit of [0, 1001, 1.5])
    await expect(api.list({ limit })).rejects.toThrow();
  await expect(api.get(Array(101).fill("key"))).rejects.toThrow("100");
  expect(await api.get("key")).toBe("old");
});
it("does not publish partial streams and cancels oversized input", async () => {
  const api = new LocalStorageKV("test", storage()).create();
  await api.put("key", "old");
  const failure = new Error("source failure");
  await expect(
    api.put(
      "key",
      new ReadableStream({
        start(c) {
          c.error(failure);
        },
      }),
    ),
  ).rejects.toBe(failure);
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array(25 * 1024 * 1024 + 1));
    },
    cancel,
  });
  await expect(api.put("key", stream)).rejects.toThrow("25 MiB");
  expect(cancel).toHaveBeenCalledOnce();
  expect(stream.locked).toBe(false);
  expect(await api.get("key")).toBe("old");
});
it("pages in UTF-8 order without skipping keys after deletion and binds cursors to namespaces", async () => {
  const backing = storage();
  const api = new LocalStorageKV("test", backing).create();
  for (const key of ["a", "b", "c", "\uE000", "😀"])
    await api.put(key, "value");
  const first = await api.list({ limit: 1 });
  if (first.list_complete) throw new Error("Expected cursor");
  await api.delete("a");
  expect(
    (await api.list({ cursor: first.cursor })).keys.map((k) => k.name),
  ).toEqual(["b", "c", "\uE000", "😀"]);
  await expect(
    new LocalStorageKV("other", backing)
      .create()
      .list({ cursor: first.cursor }),
  ).rejects.toThrow("cursor");
  await expect(api.list({ prefix: "a", cursor: first.cursor })).rejects.toThrow(
    "cursor",
  );
  await expect(api.list({ cursor: "broken" })).rejects.toThrow("cursor");
});
it("distinguishes stored JSON null from a missing bulk metadata entry", async () => {
  const api = new LocalStorageKV("test", storage()).create();
  await api.put("null", "null", { metadata: false });
  const results = await api.getWithMetadata(["null", "missing"], "json");
  expect(results.get("null")).toEqual({ value: null, metadata: false });
  expect(results.get("missing")).toBeNull();
  // @ts-expect-error Null must not silently select a default limit.
  await expect(api.list({ limit: null })).rejects.toThrow();
});

it("starts a stream write's TTL when the collected value is committed", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T00:00:00Z"));
  try {
    const api = new LocalStorageKV("slow", storage()).create();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const options = { expirationTtl: 60 };
    const pending = api.put(
      "key",
      new ReadableStream<Uint8Array>({
        start(c) {
          controller = c;
        },
      }),
      options,
    );
    // Options are captured at invocation even when stream collection yields.
    options.expirationTtl = 120;
    vi.setSystemTime(new Date("2026-10-16T00:01:01Z"));
    controller.enqueue(new TextEncoder().encode("value"));
    controller.close();
    await pending;
    expect(await api.get("key")).toBe("value");
    expect((await api.list()).keys[0].expiration).toBe(Date.now() / 1000 + 60);
    vi.advanceTimersByTime(60_000);
    expect(await api.get("key")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
it("rejects an absolute expiration elapsed during collection without replacing the old value", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T00:00:00Z"));
  try {
    const api = new LocalStorageKV("slow", storage()).create();
    await api.put("key", "old", { metadata: { version: 1 } });
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const pending = api.put(
      "key",
      new ReadableStream<Uint8Array>({
        start(c) {
          controller = c;
        },
      }),
      { expiration: Date.now() / 1000 + 60 },
    );
    vi.setSystemTime(new Date("2026-10-16T00:01:01Z"));
    controller.enqueue(new TextEncoder().encode("new"));
    controller.close();
    await expect(pending).rejects.toThrow("elapsed");
    expect(await api.getWithMetadata("key")).toEqual({
      value: "old",
      metadata: { version: 1 },
    });
  } finally {
    vi.useRealTimers();
  }
});
it("rejects nested and cyclic read modes in single and bulk reads", async () => {
  const api = new LocalStorageKV("invalid-read", storage()).create();
  await api.put("key", "42");
  const cyclic: { type?: unknown } = {};
  cyclic.type = cyclic;
  for (const options of [
    { type: { type: "json" } },
    cyclic,
    { type: null },
    { type: 1 },
  ]) {
    await expect(api.get("key", options as never)).rejects.toBeInstanceOf(
      TypeError,
    );
    await expect(api.get(["key"], options as never)).rejects.toBeInstanceOf(
      TypeError,
    );
    await expect(
      api.getWithMetadata("key", options as never),
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      api.getWithMetadata(["key"], options as never),
    ).rejects.toBeInstanceOf(TypeError);
  }
});

it("decodes streams lazily in bounded chunks and preserves split base64 groups on writes", async () => {
  const api = new LocalStorageKV("streaming", storage()).create();
  const expected = Uint8Array.from({ length: 150003 }, (_, i) => i % 251);
  let offset = 0;
  await api.put(
    "data",
    new ReadableStream({
      pull(controller) {
        if (offset === expected.length) {
          controller.close();
          return;
        }
        const end = Math.min(
          expected.length,
          offset + (offset < 4 ? 1 : 12347),
        );
        controller.enqueue(expected.slice(offset, end));
        offset = end;
      },
    }),
  );
  const decode = vi.spyOn(globalThis, "atob");
  try {
    const stream = (await api.get("data", "stream"))!;
    expect(decode).not.toHaveBeenCalled();
    const reader = stream.getReader();
    const parts: Uint8Array[] = [];
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      parts.push(next.value);
    }
    expect(Math.max(...parts.map((part) => part.length))).toBeLessThanOrEqual(
      49152,
    );
    expect(
      new Uint8Array(await new Blob(parts as BlobPart[]).arrayBuffer()),
    ).toEqual(expected);
    expect(decode.mock.calls.every(([value]) => value.length <= 65536)).toBe(
      true,
    );
  } finally {
    decode.mockRestore();
  }
});
