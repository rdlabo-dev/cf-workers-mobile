import { afterEach, expect, it, vi } from "vitest";
import {
  registerDocumentWorker,
  stopDocumentWorker,
} from "../../src/documents/registration";
import { capacitorWorkers } from "../../src/index";
function setup() {
  const own = {
    scriptURL:
      "https://localhost/capacitor-workers-sw.js?baseURL=https%3A%2F%2Fworker.example",
    postMessage: vi.fn((_message, ports) => {
      ports[0].postMessage("disabled");
      ports[0].close();
    }),
  };
  const other = {
    scriptURL: "https://localhost/app-sw.js",
    postMessage: vi.fn(),
  };
  const registration = {
    active: own,
    waiting: null,
    installing: null,
    unregister: vi.fn(async () => true),
  };
  const unrelated = {
    active: other,
    waiting: null,
    installing: null,
    unregister: vi.fn(async () => true),
  };
  const container = {
    controller: own,
    getRegistrations: vi.fn(async () => [registration, unrelated]),
    getRegistration: vi.fn(async () => registration),
    register: vi.fn(async () => registration),
  };
  vi.stubGlobal("navigator", { serviceWorker: container });
  vi.stubGlobal("location", {
    origin: "https://localhost",
    href: "https://localhost/index.html",
    reload: vi.fn(),
  });
  return { own, other, registration, unrelated, container };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("disables and unregisters only the document transport, including the current controller", async () => {
  const s = setup();
  await stopDocumentWorker();
  expect(s.own.postMessage).toHaveBeenCalledTimes(1);
  expect(s.registration.unregister).toHaveBeenCalledOnce();
  expect(s.other.postMessage).not.toHaveBeenCalled();
  expect(s.unrelated.unregister).not.toHaveBeenCalled();
  expect(location.reload).not.toHaveBeenCalled();
});
it("disables a controller even when its registration was already removed", async () => {
  const s = setup();
  s.container.getRegistrations.mockResolvedValue([]);
  await stopDocumentWorker();
  expect(s.own.postMessage).toHaveBeenCalledOnce();
});
it("reloads after unregistering a legacy controller without the disable protocol", async () => {
  vi.useFakeTimers();
  const s = setup();
  s.own.postMessage.mockImplementation((_message, ports) => ports[0].close());
  const stopped = stopDocumentWorker();
  await vi.advanceTimersByTimeAsync(2000);
  await stopped;
  expect(s.registration.unregister).toHaveBeenCalledOnce();
  expect(location.reload).toHaveBeenCalledOnce();
});
it("does not overwrite a registration owned by the application", async () => {
  const s = setup();
  s.container.getRegistration.mockResolvedValue(s.unrelated);
  await expect(
    registerDocumentWorker("https://worker.example"),
  ).rejects.toThrow("conflicts");
  expect(s.container.register).not.toHaveBeenCalled();
});
it("clears previous document registration when starting Android Fetch-only mode", async () => {
  const s = setup();
  vi.stubGlobal("Capacitor", { getPlatform: () => "android" });
  const app = capacitorWorkers({
    baseURL: "https://worker.example",
    worker: { fetch: () => new Response("ok") },
  });
  try {
    await app.ready;
    expect(s.registration.unregister).toHaveBeenCalledOnce();
    expect(await (await fetch("https://worker.example/api")).text()).toBe("ok");
  } finally {
    await app.dispose();
  }
});
it("keeps the installation lock until a pending migration finishes", async () => {
  const s = setup();
  let finish!: (value: (typeof s.registration)[]) => void;
  s.container.getRegistrations.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("Capacitor", { getPlatform: () => "android" });
  const options = {
    baseURL: "https://worker.example",
    worker: { fetch: () => new Response("ok") },
  };
  const app = capacitorWorkers(options);
  const stopped = app.dispose();
  expect(() => capacitorWorkers(options)).toThrow("already installed");
  finish([]);
  await stopped;
  await app.ready;
  vi.stubGlobal("Capacitor", { getPlatform: () => "web" });
  const next = capacitorWorkers(options);
  await next.ready;
  await next.dispose();
});

it.each(["web", "android"])(
  "%s Fetch-only startup failure keeps local requests from escaping to native fetch",
  async (platform) => {
    const s = setup();
    vi.stubGlobal("Capacitor", { getPlatform: () => platform });
    const nativeFetch = vi.fn(async () => new Response("network"));
    vi.stubGlobal("fetch", nativeFetch);
    const failure = new Error("Worker startup failed");
    const app = capacitorWorkers({
      baseURL: "https://worker.example/api",
      prefer: "direct",
      worker: {
        createWorker: () => {
          throw new Error("Not selected");
        },
        loadDirect: async () => {
          throw failure;
        },
      },
    });
    try {
      await expect(app.ready).rejects.toBe(failure);
      for (let i = 0; i < 2; i++)
        await expect(fetch("https://worker.example/api/echo")).rejects.toBe(
          failure,
        );
      await app.drain();
      expect(nativeFetch).not.toHaveBeenCalled();
      if (platform === "android")
        expect(s.registration.unregister).toHaveBeenCalledOnce();
    } finally {
      await app.dispose();
    }
    expect(fetch).toBe(nativeFetch);
  },
);

it("does not reload an acknowledged controller when another registration worker times out", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const s = setup();
  const inactive = {
    ...s.own,
    postMessage: vi.fn((_message, ports) => ports[0].close()),
  };
  s.registration.active = inactive;
  const stopped = stopDocumentWorker();
  // Let the real MessageChannel deliver the current controller's acknowledgement.
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
  await vi.advanceTimersByTimeAsync(2000);
  await stopped;
  expect(s.registration.unregister).toHaveBeenCalledOnce();
  expect(location.reload).not.toHaveBeenCalled();
});
