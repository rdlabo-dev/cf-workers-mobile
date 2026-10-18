import { afterEach, expect, it, vi } from "vitest";
import { workersCapacitor } from "../../src/index";
import {
  createNativeNetwork,
  type NativeCall,
} from "../../src/browser/fetch/native-network";

afterEach(() => vi.unstubAllGlobals());
it("public disposal waits for native close before permitting a new runtime", async () => {
  let release!: () => void;
  const closed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const call = vi.fn<NativeCall>((_, method) =>
    method === "socketOpen" ? new Promise(() => {}) : closed,
  );
  vi.stubGlobal("Capacitor", {
    nativePromise: call,
    isNativePlatform: () => true,
    getPlatform: () => "ios",
  });
  const options = {
    baseURL: "https://worker.invalid",
    worker: { fetch: () => new Response("ok") },
  };
  const runtime = workersCapacitor(options);
  const connection = await createNativeNetwork().open({
    url: "https://upstream.invalid",
    method: "GET",
    headers: [],
    hasBody: false,
  });
  const rejected = expect(connection.headers).rejects.toThrow("disposed");
  const disposed = runtime.dispose();
  expect(disposed).toBeInstanceOf(Promise);
  expect(runtime.dispose()).toBe(disposed);
  expect(() => workersCapacitor(options)).toThrow("already installed");
  await rejected;
  release();
  await disposed;
  expect(
    call.mock.calls.filter(([, method]) => method === "socketClose"),
  ).toHaveLength(1);
  const replacement = workersCapacitor(options);
  await replacement.dispose();
});

it("cleans native ownership even when the direct loader's disposal throws", async () => {
  vi.stubGlobal("Capacitor", {
    nativePromise: vi.fn<NativeCall>(async () => undefined),
    isNativePlatform: () => true,
    getPlatform: () => "ios",
  });
  const runtime = workersCapacitor({
    baseURL: "https://worker.invalid",
    prefer: "direct",
    worker: {
      createWorker() {
        throw new Error("Unexpected Worker selection");
      },
      async loadDirect() {
        return {
          handler: { fetch: () => new Response("ok") },
          dispose() {
            throw new Error("loader cleanup");
          },
        };
      },
    },
  });
  await runtime.ready;
  await expect(runtime.dispose()).rejects.toThrow("Runtime cleanup failed");
  const replacement = workersCapacitor({
    baseURL: "https://worker.invalid",
    worker: { fetch: () => new Response("ok") },
  });
  await replacement.dispose();
});

it("accepts Requests created before installation and Responses from a saved constructor", async () => {
  const NativeRequest = globalThis.Request;
  const NativeResponse = globalThis.Response;
  const source = new NativeRequest("https://worker.invalid/echo", {
    method: "POST",
    body: "payload",
  });
  const runtime = workersCapacitor({
    baseURL: "https://worker.invalid",
    worker: {
      async fetch(request) {
        return new NativeResponse(await request.text());
      },
    },
  });
  try {
    expect(globalThis.Request).not.toBe(NativeRequest);
    expect(await (await fetch(source)).text()).toBe("payload");
    expect(source.bodyUsed).toBe(true);
  } finally {
    await runtime.dispose();
  }
  expect(globalThis.Request).toBe(NativeRequest);
  expect(globalThis.Response).toBe(NativeResponse);
});

it("routes public native outbound fetch through the owned byte transport", async () => {
  let read = 0;
  const call = vi.fn<NativeCall>(async (_, method) => {
    if (method === "socketRead")
      return read++
        ? { eof: true }
        : {
            chunk: btoa(
              "HTTP/1.1 200 OK\r\nSet-Cookie: a=1\r\nSet-Cookie: b=2\r\nContent-Length: 15\r\n\r\nnative response",
            ),
          };
  });
  vi.stubGlobal("Capacitor", {
    nativePromise: call,
    isNativePlatform: () => true,
    getPlatform: () => "ios",
  });
  const runtime = workersCapacitor({
    baseURL: "https://worker.invalid",
    worker: { fetch: () => new Response("local") },
  });
  try {
    const response = await fetch("https://upstream.invalid/path");
    expect(response.headers.getSetCookie()).toEqual(["a=1", "b=2"]);
    expect(await response.text()).toBe("native response");
    expect(
      call.mock.calls.find(([, method]) => method === "socketOpen")?.[2].host,
    ).toBe("upstream.invalid");
  } finally {
    await runtime.dispose();
  }
  expect(
    call.mock.calls.filter(([, method]) => method === "socketClose"),
  ).toHaveLength(1);
});

it.each(["direct", "preferred"])(
  "%s runtime sends compatible Request assets through the browser transport",
  async (mode) => {
    const NativeResponse = globalThis.Response;
    const browser = vi.fn<typeof fetch>(
      async () => new NativeResponse("asset"),
    );
    vi.stubGlobal("fetch", browser);
    vi.stubGlobal("location", new URL("capacitor://localhost/index.html"));
    const handler = { fetch: () => new Response("worker") };
    const runtime = workersCapacitor({
      baseURL: "https://worker.invalid/api",
      ...(mode === "direct"
        ? { worker: handler }
        : {
            prefer: "direct" as const,
            worker: {
              createWorker() {
                throw Error("unexpected Worker");
              },
              async loadDirect() {
                return handler;
              },
            },
          }),
    });
    try {
      await runtime.ready;
      const response = await fetch(
        new Request("capacitor://localhost/image.svg"),
      );
      expect(await response.text()).toBe("asset");
      expect(browser.mock.calls[0]?.[0]).toBe(
        "capacitor://localhost/image.svg",
      );
    } finally {
      await runtime.dispose();
    }
  },
);

it("disposal joins an in-flight direct loader and its eventual cleanup", async () => {
  let finishLoad!: (loaded: {
    handler: { fetch(): Response };
    dispose(): Promise<void>;
  }) => void;
  let finishCleanup!: () => void;
  const loading = new Promise<{
    handler: { fetch(): Response };
    dispose(): Promise<void>;
  }>((resolve) => {
    finishLoad = resolve;
  });
  const cleanup = new Promise<void>((resolve) => {
    finishCleanup = resolve;
  });
  const options = {
    baseURL: "https://worker.invalid",
    worker: { fetch: () => new Response("replacement") },
  };
  const NativeRequest = globalThis.Request;
  const runtime = workersCapacitor({
    baseURL: options.baseURL,
    prefer: "direct",
    worker: {
      createWorker() {
        throw Error("unexpected Worker");
      },
      loadDirect: () => loading,
    },
  });
  let disposed = false;
  const closing = Promise.resolve(runtime.dispose()).then(() => {
    disposed = true;
  });
  await Promise.resolve();
  expect(disposed).toBe(false);
  expect(() => workersCapacitor(options)).toThrow("already installed");
  finishLoad({
    handler: { fetch: () => new Response("late") },
    dispose: () => cleanup,
  });
  await Promise.resolve();
  expect(disposed).toBe(false);
  finishCleanup();
  await closing;
  expect(globalThis.Request).toBe(NativeRequest);
  const replacement = workersCapacitor(options);
  await replacement.dispose();
});

it("propagates cleanup failure from a loader returned after disposal started", async () => {
  let finishLoad!: (loaded: {
    handler: { fetch(): Response };
    dispose(): Promise<void>;
  }) => void;
  const loading = new Promise<{
    handler: { fetch(): Response };
    dispose(): Promise<void>;
  }>((resolve) => {
    finishLoad = resolve;
  });
  const runtime = workersCapacitor({
    baseURL: "https://worker.invalid",
    prefer: "direct",
    worker: {
      createWorker() {
        throw Error("unexpected Worker");
      },
      loadDirect: () => loading,
    },
  });
  const closing = runtime.dispose();
  const rejected = expect(closing).rejects.toThrow("Runtime cleanup failed");
  finishLoad({
    handler: { fetch: () => new Response("late") },
    async dispose() {
      throw Error("late cleanup failed");
    },
  });
  await rejected;
  const replacement = workersCapacitor({
    baseURL: "https://worker.invalid",
    worker: { fetch: () => new Response("ok") },
  });
  await replacement.dispose();
});
