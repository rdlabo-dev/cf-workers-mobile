import { afterEach, expect, it, vi } from "vitest";
import { createFetchRuntime } from "../../src/fetch/worker-runtime.js";
import { workerFor } from "../helpers/isolated-worker.js";
import type { RemoteWorkerOptions } from "../../src/fetch/types.js";

const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const dispose of cleanups.splice(0)) await dispose();
  vi.unstubAllGlobals();
});
function setup(
  prefer: "direct" | "worker",
  remote: RemoteWorkerOptions,
  send = vi.fn(async (_request: Request) => new Response("remote")),
) {
  vi.stubGlobal("fetch", send);
  vi.stubGlobal("Worker", function Worker() {});
  const handler = { fetch: vi.fn(() => new Response("local")) };
  const source = {
    createWorker: () => workerFor(handler) as unknown as Worker,
    loadDirect: async () => handler,
    needsRemote: (request: Request) =>
      new URL(request.url).pathname.startsWith("/api"),
  };
  const runtime = createFetchRuntime({
    baseURL: "https://same.example/",
    worker: source,
    prefer,
    remote,
  });
  cleanups.push(() => runtime.dispose());
  return { runtime, handler, send };
}
for (const prefer of ["direct", "worker"] as const) {
  it(`${prefer}: sends remote routes before user code, reusing the existing HTTP request`, async () => {
    let token = "first";
    const getToken = vi.fn(() => token);
    const { runtime, handler, send } = setup(prefer, {
      origin: "https://same.example",
      getToken,
    });
    await runtime.ready;
    expect(await (await runtime.fetch("https://same.example/")).text()).toBe(
      "local",
    );
    expect(getToken).not.toHaveBeenCalled();
    expect(
      await (
        await runtime.fetch("https://same.example/api/items?q=1", {
          method: "POST",
          body: "payload",
          headers: { "content-type": "text/plain", cookie: "local-only" },
        })
      ).text(),
    ).toBe("remote");
    expect(handler.fetch).toHaveBeenCalledTimes(1);
    const request = send.mock.calls[0][0];
    expect(request.url).toBe("https://same.example/api/items?q=1");
    expect(request.method).toBe("POST");
    expect(await request.text()).toBe("payload");
    expect(request.headers.get("authorization")).toBe("Bearer first");
    expect(request.headers.get("cookie")).toBeNull();
    expect(request.redirect).toBe("error");
    token = "second";
    await runtime.fetch("https://same.example/api/next");
    expect(send.mock.calls[1][0].headers.get("authorization")).toBe(
      "Bearer second",
    );
  });
}
it("preserves an existing bearer session without a login provider and never retries 401", async () => {
  const send = vi.fn(
    async (_request: Request) => new Response(null, { status: 401 }),
  );
  const { runtime, handler } = setup(
    "direct",
    { origin: "https://server.example" },
    send,
  );
  const response = await runtime.fetch("https://same.example/api", {
    headers: { authorization: "Bearer existing" },
  });
  expect(response.status).toBe(401);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0].headers.get("authorization")).toBe(
    "Bearer existing",
  );
  expect(handler.fetch).not.toHaveBeenCalled();
});
it("aborts a pending credential lookup without sending or falling back locally", async () => {
  let resolveToken!: (token: string) => void;
  const { runtime, handler, send } = setup("direct", {
    origin: "https://server.example",
    getToken: () =>
      new Promise((resolve) => {
        resolveToken = resolve;
      }),
  });
  await runtime.ready;
  const controller = new AbortController();
  const pending = runtime.fetch("https://same.example/api", {
    signal: controller.signal,
  });
  await vi.waitFor(() => expect(resolveToken).toBeTypeOf("function"));
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  resolveToken("late");
  await Promise.resolve();
  expect(send).not.toHaveBeenCalled();
  expect(handler.fetch).not.toHaveBeenCalled();
});
it("disposal rejects a pending credential lookup and cannot send into a replacement runtime", async () => {
  let resolveToken!: (token: string) => void;
  const { runtime, send } = setup("direct", {
    origin: "https://server.example",
    getToken: () =>
      new Promise((resolve) => {
        resolveToken = resolve;
      }),
  });
  const pending = runtime.fetch("https://same.example/api");
  const rejected = expect(pending).rejects.toThrow("disposed");
  await vi.waitFor(() => expect(resolveToken).toBeTypeOf("function"));
  await runtime.dispose();
  await rejected;
  resolveToken("late");
  await Promise.resolve();
  expect(send).not.toHaveBeenCalled();
});
it("rejects ambiguous remote configuration before loading application code", () => {
  const source = {
    createWorker: vi.fn(),
    loadDirect: vi.fn(),
    needsRemote: () => true,
  };
  expect(() =>
    createFetchRuntime({ baseURL: "https://local.example", worker: source }),
  ).toThrow("remote.origin");
  for (const origin of [
    "http://example.com",
    "https://example.com/path",
    "https://user:password@example.com",
    "https://example.com/?x=1",
  ])
    expect(() =>
      createFetchRuntime({
        baseURL: "https://local.example",
        worker: source,
        remote: { origin },
      }),
    ).toThrow("HTTPS origin");
  expect(source.loadDirect).not.toHaveBeenCalled();
  expect(source.createWorker).not.toHaveBeenCalled();
});
it("cannot dispatch locally after disposal while an async selector is pending", async () => {
  let selected!: (remote: boolean) => void;
  const handler = { fetch: vi.fn(() => new Response("local")) };
  const runtime = createFetchRuntime({
    baseURL: "https://local.example",
    prefer: "direct",
    remote: { origin: "https://server.example" },
    worker: {
      createWorker: vi.fn(),
      loadDirect: async () => handler,
      needsRemote: () =>
        new Promise((resolve) => {
          selected = resolve;
        }),
    },
  });
  cleanups.push(() => runtime.dispose());
  const pending = runtime.fetch("https://local.example/");
  await vi.waitFor(() => expect(selected).toBeTypeOf("function"));
  await runtime.dispose();
  selected(false);
  await expect(pending).rejects.toThrow("disposed");
  expect(handler.fetch).not.toHaveBeenCalled();
});
