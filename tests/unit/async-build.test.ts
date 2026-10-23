import { expect, it } from "vitest";
import { transform } from "esbuild";
import { lowerAsync } from "../../src/tooling/async.js";

it("preserves runtime arity and receivers when lowering TypeScript async functions", async () => {
  const lowered = await lowerAsync(
    `export async function original(this: { value: number }, n: number) {
      await Promise.resolve();
      return this.value + n;
    }`,
    "worker.ts",
    "ts",
  );
  const { code } = await transform(lowered.code, {
    loader: "ts",
    format: "esm",
  });
  const { original } = await import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
  expect(original.length).toBe(1);
  expect(await original.call({ value: 4 }, 3)).toBe(7);
});

it("preserves native async iterator identity through repeated build passes", async () => {
  const source = `export const intrinsic = Object.getPrototypeOf(
    Object.getPrototypeOf(async function* () {}).prototype
  );
  export const empty = async function* () {};`;
  const first = await lowerAsync(source, "worker.js", "js");
  // Vite transforms source modules and subsequently rendered chunks.
  const second = await lowerAsync(first.code, "chunk.js", "js");
  const api = await import(
    `data:text/javascript;base64,${Buffer.from(second.code).toString("base64")}`
  );
  const native = Object.getPrototypeOf(
    Object.getPrototypeOf(async function* () {}).prototype,
  );
  expect(api.intrinsic).toBe(native);
  const iterator = api.empty();
  expect(iterator[Symbol.asyncIterator]()).toBe(iterator);
  expect(await iterator.next()).toEqual({ value: undefined, done: true });
});

it("still lowers generators with continuations and preserves cancellation cleanup", async () => {
  const source = `export const sequence = async function* () {
    try { yield await Promise.resolve(1); yield 2; }
    finally { globalThis.__asyncBuildCleanup = true; }
  };`;
  const lowered = await lowerAsync(source, "worker.js", "js");
  expect(lowered.code).not.toMatch(/async\s+function\s*\*/);
  const { sequence } = await import(
    `data:text/javascript;base64,${Buffer.from(lowered.code).toString("base64")}`
  );
  const state = globalThis as typeof globalThis & {
    __asyncBuildCleanup?: boolean;
  };
  try {
    const iterator = sequence();
    expect(await iterator.next()).toEqual({ value: 1, done: false });
    expect(await iterator.return("cancel")).toEqual({
      value: "cancel",
      done: true,
    });
    expect(state.__asyncBuildCleanup).toBe(true);
  } finally {
    delete state.__asyncBuildCleanup;
  }
});
