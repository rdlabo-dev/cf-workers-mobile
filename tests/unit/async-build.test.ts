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
