import { afterEach, expect, it, vi } from "vitest";
import { capacitorWorkers, type WorkerHandler } from "../../src/index";
import { createIsolatedWorker } from "../../src/isolated/bridge";

import { workerFor } from "../helpers/isolated-worker";
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.unstubAllGlobals();
});
function setup(handler: WorkerHandler<unknown>) {
  const client = workerFor(handler);
  const isolated = createIsolatedWorker(client as unknown as Worker);
  cleanups.push(isolated.dispose);
  const pending: Promise<unknown>[] = [];
  const ctx = {
    props: {},
    passThroughOnException() {},
    waitUntil(p: Promise<unknown>) {
      pending.push(p);
    },
  };
  return { client, isolated, pending, ctx };
}

it("releases completed calls after both body and background completion", async () => {
  let finish!: () => void;
  const background = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const { isolated, ctx, pending } = setup({
    fetch(_request, _env, ctx) {
      ctx.waitUntil(background);
      return new Response("ok");
    },
  });
  const response = await isolated.handler.fetch(
    new Request("https://test/api"),
    {},
    ctx,
  );
  expect(await response.text()).toBe("ok");
  expect(isolated.activeCalls).toBe(1);
  finish();
  await Promise.all(pending);
  await vi.waitFor(() => expect(isolated.activeCalls).toBe(0));
  for (let i = 0; i < 30; i++) {
    const next = await isolated.handler.fetch(
      new Request("https://test/api"),
      {},
      ctx,
    );
    await next.text();
  }
  await Promise.all(pending);
  await vi.waitFor(() => expect(isolated.activeCalls).toBe(0));
});

it("rejects unusable Worker responses instead of hanging the caller", async () => {
  const { isolated, ctx, pending } = setup({ fetch: () => Response.error() });
  await expect(
    isolated.handler.fetch(new Request("https://test/api"), {}, ctx),
  ).rejects.toThrow("non-error Response");
  await Promise.all(pending);
  expect(isolated.activeCalls).toBe(0);
});

it("fails pending bodies and drains background tracking on worker failure", async () => {
  const { client, isolated, ctx, pending } = setup({
    fetch(_request, _env, ctx) {
      ctx.waitUntil(new Promise(() => {}));
      return new Response(new ReadableStream());
    },
  });
  const response = await isolated.handler.fetch(
    new Request("https://test/api"),
    {},
    ctx,
  );
  const body = response.text();
  client.onerror!({ message: "worker crashed", preventDefault() {} });
  await expect(body).rejects.toThrow("worker crashed");
  await Promise.all(pending);
  expect(isolated.activeCalls).toBe(0);
  await expect(
    isolated.handler.fetch(new Request("https://test/api"), {}, ctx),
  ).rejects.toThrow("worker crashed");
});

it("cleans up a non-cloneable env without poisoning subsequent calls", async () => {
  const { isolated, ctx, pending } = setup({ fetch: () => new Response("ok") });
  await expect(
    isolated.handler.fetch(new Request("https://test/api"), { fn() {} }, ctx),
  ).rejects.toThrow();
  expect(isolated.activeCalls).toBe(0);
  await Promise.all(pending);
  expect(
    await (
      await isolated.handler.fetch(new Request("https://test/api"), {}, ctx)
    ).text(),
  ).toBe("ok");
});

it("the public factory path disposes the worker and can be installed again", async () => {
  const client = workerFor({ fetch: (_req, env) => Response.json(env) });
  const original = globalThis.fetch;
  const runtime = capacitorWorkers({
    worker: () => client as unknown as Worker,
    baseURL: "https://test/api",
    env: { value: "injected" },
  });
  cleanups.push(runtime.dispose);
  await runtime.ready;
  expect(await (await fetch("https://test/api")).json()).toEqual({
    value: "injected",
  });
  runtime.dispose();
  expect(client.terminate).toHaveBeenCalledOnce();
  expect(globalThis.fetch).toBe(original);
  const next = capacitorWorkers({
    worker: { fetch: () => new Response("next") },
    baseURL: "https://test/api",
  });
  cleanups.push(next.dispose);
  expect(await (await fetch("https://test/api")).text()).toBe("next");
});

it.each(["opaque", "opaqueredirect"] as const)(
  "rejects a %s response at the transport boundary",
  async (type) => {
    // Node has no cross-origin fetch filtering; model its standard status/type.
    const response = new Response(null);
    Object.defineProperties(response, {
      status: { value: 0 },
      type: { value: type },
    });
    const { isolated, ctx, pending } = setup({ fetch: () => response });
    await expect(
      isolated.handler.fetch(new Request("https://test/api"), {}, ctx),
    ).rejects.toThrow("non-error Response");
    await Promise.all(pending);
    expect(isolated.activeCalls).toBe(0);
  },
);

it("reports response reconstruction failure and releases the call", async () => {
  let port: MessagePort | undefined;
  const worker = {
    postMessage(data: { port: MessagePort }) {
      port = data.port;
      port.postMessage({
        type: "response",
        status: 0,
        statusText: "",
        headers: [],
        hasBody: false,
      });
    },
    terminate() {
      port?.close();
    },
  };
  const isolated = createIsolatedWorker(worker as unknown as Worker);
  cleanups.push(isolated.dispose);
  (worker as unknown as Worker).onmessage!({
    data: { type: "ready" },
  } as MessageEvent);
  const background: Promise<unknown>[] = [];
  await expect(
    isolated.handler.fetch(
      new Request("https://test/api"),
      {},
      {
        props: {},
        passThroughOnException() {},
        waitUntil(p) {
          background.push(p);
        },
      },
    ),
  ).rejects.toThrow();
  await Promise.all(background);
  expect(isolated.activeCalls).toBe(0);
});

it.each(["dispose", "crash", "abort"] as const)(
  "settles a paused upload and cancels its source on %s",
  async (action) => {
    const fetchHandler = vi.fn(
      async (request: Request) => new Response(await request.text()),
    );
    const { client, isolated, ctx, pending } = setup({ fetch: fetchHandler });
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const controller = new AbortController();
    const request = new Request("https://test/api", {
      method: "POST",
      body: new ReadableStream<Uint8Array>({
        start(stream) {
          stream.enqueue(new Uint8Array([1]));
        },
        cancel,
      }),
      signal: controller.signal,
      duplex: "half",
    } as RequestInit);
    const outcome = Promise.resolve(
      isolated.handler.fetch(request, {}, ctx),
    ).then(
      () => "unexpected",
      (error) => String(error),
    );
    await vi.waitFor(() => expect(request.body!.locked).toBe(true));
    if (action === "dispose") isolated.dispose();
    else if (action === "crash")
      client.onerror!({ message: "worker crashed", preventDefault() {} });
    else controller.abort();
    expect(await outcome).toMatch(/disposed|crashed|abort/i);
    await Promise.all(pending);
    expect(cancel).toHaveBeenCalledOnce();
    expect(isolated.activeCalls).toBe(0);
    expect(fetchHandler).toHaveBeenCalledOnce();
  },
);

it("tracks a call waiting for startup and releases it on disposal", async () => {
  const worker = { postMessage: vi.fn(), terminate: vi.fn() };
  const isolated = createIsolatedWorker(worker as unknown as Worker);
  cleanups.push(isolated.dispose);
  const pending: Promise<unknown>[] = [];
  const result = isolated.handler.fetch(
    new Request("https://test/api"),
    {},
    {
      props: {},
      passThroughOnException() {},
      waitUntil(p) {
        pending.push(p);
      },
    },
  );
  expect(isolated.activeCalls).toBe(1);
  isolated.dispose();
  await expect(result).rejects.toThrow("disposed");
  await Promise.all(pending);
  expect(isolated.activeCalls).toBe(0);
  expect(worker.postMessage).not.toHaveBeenCalled();
});

it("streams uploads before EOF and transfers bounded chunks", async () => {
  let source!: ReadableStreamDefaultController<Uint8Array>;
  let received!: () => void;
  const first = new Promise<void>((resolve) => {
    received = resolve;
  });
  const sizes: number[] = [];
  const { isolated, ctx } = setup({
    async fetch(request) {
      const reader = request.body!.getReader();
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        sizes.push(next.value.length);
        received();
      }
      return new Response("ok");
    },
  });
  const result = isolated.handler.fetch(
    new Request("https://test/upload", {
      method: "POST",
      duplex: "half",
      body: new ReadableStream({
        start(controller) {
          source = controller;
          controller.enqueue(new Uint8Array(200000));
        },
      }),
    } as RequestInit),
    {},
    ctx,
  );
  await first;
  source.close();
  expect(await (await result).text()).toBe("ok");
  expect(sizes.reduce((a, b) => a + b, 0)).toBe(200000);
  expect(Math.max(...sizes)).toBeLessThanOrEqual(65536);
});

it("cancels an unread upload when a handler responds without reading it", async () => {
  const cancel = vi.fn();
  const { isolated, ctx, pending } = setup({
    fetch: () => new Response("early"),
  });
  const body = new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 });
  const request = new Request("https://test/api", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit);
  expect(await (await isolated.handler.fetch(request, {}, ctx)).text()).toBe(
    "early",
  );
  await Promise.all(pending);
  await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  expect(body.locked).toBe(false);
});

it("releases the upload reader after successful EOF", async () => {
  const { isolated, ctx, pending } = setup({
    fetch: async (request) => new Response(await request.text()),
  });
  const request = new Request("https://test/api", {
    method: "POST",
    body: "data",
  });
  expect(await (await isolated.handler.fetch(request, {}, ctx)).text()).toBe(
    "data",
  );
  await Promise.all(pending);
  await vi.waitFor(() => expect(isolated.activeCalls).toBe(0));
  expect(request.body!.locked).toBe(false);
});
