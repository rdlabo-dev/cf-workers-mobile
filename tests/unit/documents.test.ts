import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { workersCapacitor } from "../../src/index";
let runtime: ReturnType<typeof workersCapacitor> | undefined;
let native: ReturnType<typeof vi.fn>;
const worker = {
  fetch: async (request: Request) =>
    new Response((await request.text()) || "<!doctype html><h1>Worker</h1>", {
      headers: { "content-type": "text/html" },
    }),
};
const options = { baseURL: "https://worker.example", worker, render: "/" };
beforeEach(() => {
  native = vi.fn(async () => ({}));
  vi.stubGlobal("Capacitor", {
    getPlatform: () => "ios",
    isPluginAvailable: () => true,
    nativePromise: native,
  });
  vi.stubGlobal("location", new URL("capacitor://localhost/index.html"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(["/index.html", "/main.js"])),
  );
});
afterEach(async () => {
  await runtime?.dispose();
  runtime = undefined;
  vi.unstubAllGlobals();
});
it("starts documents through the same public entry and keeps Worker routing", async () => {
  runtime = workersCapacitor(options);
  await runtime.ready;
  expect(native).toHaveBeenCalledWith(
    "WorkersCapacitor",
    "start",
    expect.objectContaining({
      entry: "/",
      baseURL: options.baseURL,
      assets: ["/index.html", "/main.js"],
    }),
  );
  const dispatch = (globalThis as any).__workersCapacitorDispatch;
  const result = await dispatch({
    url: "capacitor://localhost/api/echo",
    method: "POST",
    headers: {},
    body: btoa("payload"),
  });
  expect(atob(result.body)).toBe("payload");
  expect(result.url).toBe("https://worker.example/api/echo");
  await runtime.dispose();
  expect(native).toHaveBeenLastCalledWith("WorkersCapacitor", "stop", {});
  expect((globalThis as any).__workersCapacitorDispatch).toBeUndefined();
});
it.each([
  "//remote.example/",
  "https://remote.example/",
  "/\\remote",
  "/\n/outside.example",
  "",
])("rejects invalid entry %s before changing fetch", (entry) => {
  const original = fetch;
  expect(() => workersCapacitor({ ...options, render: entry })).toThrow(
    "local absolute path",
  );
  expect(fetch).toBe(original);
});
it("fails explicitly when native integration is missing", () => {
  vi.stubGlobal("Capacitor", {
    getPlatform: () => "ios",
    isPluginAvailable: () => false,
  });
  expect(() => workersCapacitor(options)).toThrow("not installed");
});
it("restores fetch and releases native resources after startup failure", async () => {
  const original = fetch;
  native.mockRejectedValueOnce(new Error("Native failed"));
  runtime = workersCapacitor(options);
  await expect(runtime.ready).rejects.toThrow("Native failed");
  expect(fetch).toBe(original);
  expect(native).toHaveBeenLastCalledWith("WorkersCapacitor", "stop", {});
  runtime = workersCapacitor({ ...options, render: undefined });
  await runtime.ready;
});
it("disposes a pending start before allowing a new installation", async () => {
  let started!: () => void;
  let resolveStart!: () => void;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  native.mockImplementationOnce(() => {
    started();
    return new Promise<void>((resolve) => {
      resolveStart = resolve;
    });
  });
  runtime = workersCapacitor(options);
  const ready = runtime.ready.catch((error) => error);
  await waiting;
  const stopping = runtime.dispose();
  expect(() => workersCapacitor(options)).toThrow("already installed");
  resolveStart();
  await stopping;
  expect((await ready).message).toContain("disposed");
  runtime = workersCapacitor({ ...options, render: undefined });
  await runtime.ready;
});
it("fails before native start if generated assets are missing", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 404 })),
  );
  const original = fetch;
  runtime = workersCapacitor(options);
  await expect(runtime.ready).rejects.toThrow("assets are missing");
  expect(native).not.toHaveBeenCalled();
  expect(fetch).toBe(original);
});
it("keeps redirects inside the Worker origin and preserves POST for 307", async () => {
  const seen: string[] = [];
  runtime = workersCapacitor({
    ...options,
    worker: {
      async fetch(request) {
        seen.push(
          request.method +
            " " +
            new URL(request.url).pathname +
            " " +
            (await request.text()),
        );
        if (new URL(request.url).pathname === "/begin")
          return new Response(null, {
            status: 307,
            headers: { location: "/end" },
          });
        return new Response("done");
      },
    },
  });
  await runtime.ready;
  const dispatch = (globalThis as any).__workersCapacitorDispatch;
  const result = await dispatch({
    url: "capacitor://localhost/begin",
    method: "POST",
    headers: {},
    body: btoa("payload"),
    follow: true,
  });
  expect(atob(result.body)).toBe("done");
  expect(seen).toEqual(["POST /begin payload", "POST /end payload"]);
  await expect(
    dispatch({
      url: "https://outside.example/secret",
      method: "GET",
      headers: {},
    }),
  ).rejects.toThrow("outside the local origin");
});

function android() {
  const sw = {
    scriptURL:
      "https://localhost/workers-capacitor-sw.js?baseURL=https%3A%2F%2Fworker.example",
    postMessage: vi.fn((_message, ports) => {
      ports[0].postMessage("done");
      ports[0].close();
    }),
  };
  const registration = {
    active: sw,
    installing: null,
    waiting: null,
    unregister: vi.fn(async () => true),
  };
  const events = new EventTarget();
  const container = Object.assign(events, {
    controller: sw,
    ready: Promise.resolve(registration),
    getRegistrations: vi.fn(async () => [registration]),
    getRegistration: vi.fn(async () => registration),
    register: vi.fn(async () => registration),
  });
  vi.stubGlobal("navigator", { serviceWorker: container });
  vi.stubGlobal("location", {
    href: "https://localhost/index.html",
    origin: "https://localhost",
    protocol: "https:",
    host: "localhost",
    replace: vi.fn(),
    reload: vi.fn(),
  });
  vi.stubGlobal("Capacitor", {
    getPlatform: () => "android",
    isPluginAvailable: () => true,
    nativePromise: native,
  });
  return { sw, registration, container };
}
it("Android disposal disables its transport and unregisters it", async () => {
  const s = android();
  runtime = workersCapacitor(options);
  await runtime.ready;
  await runtime.dispose();
  expect(s.sw.postMessage.mock.calls.map((c) => c[0])).toContain(
    "workers-capacitor:disable-documents",
  );
  expect(s.registration.unregister).toHaveBeenCalled();
  expect(native).toHaveBeenCalledWith("WorkersCapacitor", "stop", {});
});
it("Android startup failure also releases an old document registration", async () => {
  const s = android();
  native.mockRejectedValueOnce(new Error("Native failed"));
  runtime = workersCapacitor(options);
  await expect(runtime.ready).rejects.toThrow("Native failed");
  expect(s.registration.unregister).toHaveBeenCalledOnce();
});
it("disposal waits for a pending SW registration and removes it after it resolves", async () => {
  const s = android();
  let resolve!: (value: typeof s.registration) => void;
  s.container.register.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  runtime = workersCapacitor(options);
  const ready = runtime.ready.catch((error) => error);
  await vi.waitFor(() => expect(s.container.register).toHaveBeenCalled());
  const stopped = runtime.dispose();
  resolve(s.registration);
  await stopped;
  expect((await ready).message).toContain("disposed");
  expect(s.registration.unregister).toHaveBeenCalled();
});

it.each([301, 302, 303, 307, 308])(
  "prepares native navigation in JS for status %i",
  async (status) => {
    runtime = workersCapacitor({
      ...options,
      worker: {
        fetch: () =>
          new Response(null, {
            status,
            headers: { location: "/end?q=1#section" },
          }),
      },
    });
    await runtime.ready;
    const dispatch = (globalThis as any).__workersCapacitorDispatch;
    const input = {
      url: "capacitor://localhost/begin",
      method: "POST",
      headers: {
        "content-type": "text/plain",
        "content-language": "ja",
        "x-keep": "yes",
      },
      body: btoa("payload"),
      document: true,
      follow: false,
    };
    const result = await dispatch(input);
    const changesMethod = [301, 302, 303].includes(status);
    expect(result.navigation).toMatchObject({
      url: "capacitor://localhost/end?q=1#section",
      method: changesMethod ? "GET" : "POST",
    });
    expect(result.navigation.body).toBe(
      changesMethod ? undefined : btoa("payload"),
    );
    expect(result.navigation.headers["content-type"]).toBe(
      changesMethod ? undefined : "text/plain",
    );
    expect(result.navigation.headers["content-language"]).toBe(
      changesMethod ? undefined : "ja",
    );
    expect(result.navigation.headers["x-keep"]).toBe("yes");
    await expect(dispatch({ ...input, redirectCount: 20 })).rejects.toThrow(
      "Too many redirects",
    );
  },
);

it("returns document headers before EOF and reads bounded chunks on demand", async () => {
  const cancel = vi.fn();
  let source!: ReadableStreamDefaultController<Uint8Array>;
  runtime = workersCapacitor({
    ...options,
    worker: {
      fetch: () =>
        new Response(
          new ReadableStream(
            {
              start(controller) {
                source = controller;
              },
              cancel,
            },
            { highWaterMark: 0 },
          ),
        ),
    },
  });
  await runtime.ready;
  const dispatch = (globalThis as any).__workersCapacitorDispatch;
  const result = await dispatch({
    url: "capacitor://localhost/live",
    method: "GET",
    headers: {},
    stream: true,
  });
  expect(result.status).toBe(200);
  expect(result.streamId).toBeTypeOf("string");
  source.enqueue(new Uint8Array(100000));
  const first = await dispatch({ action: "pull", streamId: result.streamId });
  expect(atob(first.body).length).toBe(65536);
  const second = await dispatch({ action: "pull", streamId: result.streamId });
  expect(atob(second.body).length).toBe(34464);
  await dispatch({ action: "cancel", streamId: result.streamId });
  expect(cancel).toHaveBeenCalledOnce();
  await expect(
    dispatch({ action: "pull", streamId: result.streamId }),
  ).rejects.toThrow("closed");
});

it("does not resurrect a document stream after cancellation while awaiting headers", async () => {
  const { installDocumentHost } = await import("../../src/browser/documents/host");
  let finish!: (response: Response) => void;
  const cancelled = vi.fn();
  const dispose = installDocumentHost(
    {
      ready: Promise.resolve(),
      fetch: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    },
    options.baseURL,
  );
  const dispatch = (globalThis as any).__workersCapacitorDispatch;
  try {
    const pending = dispatch({
      id: "cancel-headers",
      url: "capacitor://localhost/live",
      method: "GET",
      headers: {},
      stream: true,
    });
    const result = pending.catch((error: Error) => error);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    await dispatch({ action: "cancel", streamId: "cancel-headers" });
    finish(
      new Response(
        new ReadableStream({ cancel: cancelled }, { highWaterMark: 0 }),
      ),
    );
    expect(await result).toBeInstanceOf(Error);
    expect(cancelled).toHaveBeenCalledOnce();
    await expect(
      dispatch({ action: "pull", streamId: "cancel-headers" }),
    ).rejects.toThrow("closed");
  } finally {
    dispose();
  }
});

it("does not dispatch a document request after disposal during startup", async () => {
  const { installDocumentHost } = await import("../../src/browser/documents/host");
  let ready!: () => void;
  const fetcher = vi.fn(async () => new Response("late"));
  const dispose = installDocumentHost(
    {
      ready: new Promise<void>((resolve) => {
        ready = resolve;
      }),
      fetch: fetcher,
    },
    options.baseURL,
  );
  const dispatch = (globalThis as any).__workersCapacitorDispatch;
  const pending = dispatch({
    url: "capacitor://localhost/live",
    method: "GET",
    headers: {},
    stream: true,
  });
  const rejected = expect(pending).rejects.toThrow();
  dispose();
  ready();
  await rejected;
  expect(fetcher).not.toHaveBeenCalled();
});
