import { afterEach, expect, it, vi } from "vitest";
import { workersCapacitor, FetchRuntime } from "../../src/index";
let runtime:
  | Pick<ReturnType<typeof workersCapacitor>, "dispose" | "drain">
  | undefined;
const original = globalThis.fetch;
it("reports missing build configuration without changing fetch", () => {
  expect(() =>
    workersCapacitor({ baseURL: "https://api.example/api" }),
  ).toThrow("No Worker configured");
  expect(globalThis.fetch).toBe(original);
});
afterEach(() => {
  runtime?.dispose();
  runtime = undefined;
  globalThis.fetch = original;
  vi.unstubAllGlobals();
});
it("prevents double installation and restores fetch", () => {
  const options = {
    baseURL: "https://api.example/api",
    worker: { fetch: () => new Response() },
  };
  runtime = workersCapacitor(options);
  expect(() => workersCapacitor(options)).toThrow("already installed");
  runtime.dispose();
  runtime.dispose();
  expect(globalThis.fetch).toBe(original);
});
it("keeps env identity and separate contexts while draining nested background work", async () => {
  const env = { value: "local" };
  const contexts = new Set();
  const completed: string[] = [];
  const errors = vi.fn();
  runtime = workersCapacitor({
    baseURL: "https://api.example/api",
    env,
    onBackgroundError: errors,
    worker: {
      fetch(_req, received, ctx) {
        expect(received).toBe(env);
        contexts.add(ctx);
        ctx.waitUntil(
          Promise.resolve().then(() => {
            ctx.waitUntil(
              Promise.resolve().then(() => {
                completed.push("done");
              }),
            );
          }),
        );
        ctx.waitUntil(Promise.reject(new Error("background")));
        return new Response("ok");
      },
    },
  });
  await Promise.all([
    fetch("https://api.example/api"),
    fetch("https://api.example/api"),
  ]);
  await runtime.drain();
  expect(contexts.size).toBe(2);
  expect(completed).toHaveLength(2);
  expect(errors).toHaveBeenCalledTimes(2);
});

it("prefers a callable object's fetch method over treating it as a factory", async () => {
  const callable = vi.fn(() => {
    throw new Error("not a factory");
  });
  const worker = Object.assign(callable, {
    fetch: vi.fn(() => new Response("ok")),
  });
  runtime = workersCapacitor({ worker, baseURL: "https://test/api" });
  expect(await (await fetch("https://test/api")).text()).toBe("ok");
  expect(callable).not.toHaveBeenCalled();
  expect(worker.fetch).toHaveBeenCalledOnce();
});

it("constructing a subclass leaves global fetch intact and closes its resources once", async () => {
  class Example extends FetchRuntime {
    closed = 0;
    protected dispatch() {
      return new Response("example");
    }
    protected override close() {
      this.closed++;
    }
  }
  const example = new Example({ baseURL: "https://test/api" });
  runtime = example;
  expect(globalThis.fetch).toBe(original);
  const fetcher = example.fetch;
  expect(await (await fetcher("https://test/api")).text()).toBe("example");
  example.dispose();
  example.dispose();
  expect(example.closed).toBe(1);
  expect(globalThis.fetch).toBe(original);
});
it("validates configuration before creating an isolated Worker", () => {
  const factory = vi.fn();
  expect(() =>
    workersCapacitor({ worker: factory, baseURL: "ftp://invalid" }),
  ).toThrow("HTTP(S)");
  expect(factory).not.toHaveBeenCalled();
  expect(globalThis.fetch).toBe(original);
});
