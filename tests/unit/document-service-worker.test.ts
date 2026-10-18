import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const script = readFileSync(
  new URL("../../src/runtime/documents/service-worker.js", import.meta.url),
  "utf8",
);
function setup(cache = new Map<string, Response>()) {
  let assets = ["/index.html"];
  let hostAvailable = true;
  const listeners = new Map<string, (event: any) => void>();
  const dispatch = vi.fn(async (request: any) => ({
    url: "https://worker.example" + new URL(request.url).pathname,
    status: 200,
    headers: {},
    body: request.body ?? new TextEncoder().encode("worker").buffer,
  }));
  const nativeFetch = vi.fn(async (request: string | Request) =>
    String(typeof request === "string" ? request : request.url).includes(
      "workers-capacitor-assets.json",
    )
      ? Response.json(assets)
      : new Response("asset"),
  );
  runInNewContext(script, {
    URL,
    Request,
    Response,
    Headers,
    MessageChannel,
    ReadableStream,
    atob,
    setTimeout,
    clearTimeout,
    fetch: nativeFetch,
    caches: {
      open: async () => ({
        match: async (key: string) => cache.get(key),
        put: async (key: string, value: Response) => {
          cache.set(key, value);
        },
        delete: async (key: string) => cache.delete(key),
      }),
    },
    self: {
      location: new URL(
        "https://localhost/workers-capacitor-sw.js?baseURL=https%3A%2F%2Fworker.example",
      ),
      addEventListener: (name: string, handler: any) =>
        listeners.set(name, handler),
      clients: {
        matchAll: async () =>
          hostAvailable
            ? [
                {
                  url: "https://localhost/index.html?__workers_capacitor_host=1",
                  postMessage: async (request: any, ports: MessagePort[]) => {
                    ports[0].postMessage(await dispatch(request));
                    ports[0].close();
                  },
                },
              ]
            : [],
      },
    },
  });
  return {
    setHostAvailable: (value: boolean) => {
      hostAvailable = value;
    },
    async disable(disabled = true) {
      let pending!: Promise<void>;
      const port = { postMessage: vi.fn() };
      listeners.get("message")!({
        data: disabled
          ? "workers-capacitor:disable-documents"
          : "workers-capacitor:enable-documents",
        ports: [port],
        waitUntil: (value: Promise<void>) => {
          pending = value;
        },
      });
      await pending;
      expect(port.postMessage).toHaveBeenCalledWith("done");
    },
    dispatch,
    nativeFetch,
    setAssets: (value: string[]) => {
      assets = value;
    },
    fetch(request: Request): Promise<Response> | undefined {
      let response: Promise<Response> | undefined;
      listeners.get("fetch")!({
        request,
        respondWith: (value: Promise<Response>) => {
          response = value;
        },
      });
      return response;
    },
  };
}
it("passes POST bytes to the common Worker host", async () => {
  const sw = setup();
  const response = await sw.fetch(
    new Request("https://localhost/arbitrary/path", {
      method: "POST",
      body: "payload",
    }),
  );
  expect(await response!.text()).toBe("payload");
  expect(sw.dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      method: "POST",
      url: "https://localhost/arbitrary/path",
    }),
  );
});
it("uses the current asset manifest after an application update", async () => {
  const sw = setup();
  await sw.fetch(new Request("https://localhost/page"));
  sw.setAssets(["/index.html", "/assets/new-build.js"]);
  expect(
    await (await sw.fetch(
      new Request("https://localhost/assets/new-build.js"),
    ))!.text(),
  ).toBe("asset");
  expect(sw.dispatch).toHaveBeenCalledTimes(1);
});
it("rewrites local redirects and rejects external redirect destinations", async () => {
  const sw = setup();
  sw.dispatch.mockResolvedValueOnce({
    url: "https://worker.example/start",
    status: 307,
    headers: { location: "/end" },
    body: new ArrayBuffer(0),
  });
  const response = await sw.fetch(new Request("https://localhost/start"));
  expect(response!.status).toBe(307);
  expect(response!.headers.get("location")).toBe("https://localhost/end");
  sw.dispatch.mockResolvedValueOnce({
    url: "https://worker.example/start",
    status: 302,
    headers: { location: "https://outside.example/" },
    body: new ArrayBuffer(0),
  });
  await expect(
    sw.fetch(new Request("https://localhost/start")),
  ).rejects.toThrow("not supported");
});
it("leaves external URLs to the browser", () => {
  expect(
    setup().fetch(new Request("https://outside.example/")),
  ).toBeUndefined();
});

it("loads the bundled bootstrap when a persisted SW has no native host", async () => {
  const sw = setup();
  sw.setHostAvailable(false);
  const request = new Request("https://localhost/");
  Object.defineProperty(request, "mode", { value: "navigate" });
  expect(await (await sw.fetch(request))!.text()).toBe("asset");
  expect(sw.dispatch).not.toHaveBeenCalled();
  expect(sw.nativeFetch).toHaveBeenLastCalledWith(
    "https://localhost/index.html",
    { cache: "no-store" },
  );
});

it("stops intercepting existing clients after disable, including navigation and POST", async () => {
  const sw = setup();
  await sw.disable();
  sw.setHostAvailable(false);
  const navigation = new Request("https://localhost/about");
  Object.defineProperty(navigation, "mode", { value: "navigate" });
  expect(sw.fetch(navigation)).toBeUndefined();
  expect(
    sw.fetch(
      new Request("https://localhost/api", { method: "POST", body: "data" }),
    ),
  ).toBeUndefined();
  expect(sw.nativeFetch).not.toHaveBeenCalled();
  expect(sw.dispatch).not.toHaveBeenCalled();
});

it("keeps shutdown across a SW restart and explicitly enables a new rendering session", async () => {
  const cache = new Map<string, Response>();
  await setup(cache).disable();
  const restarted = setup(cache);
  const request = new Request("https://localhost/about");
  expect(await (await restarted.fetch(request))!.text()).toBe("asset");
  expect(restarted.dispatch).not.toHaveBeenCalled();
  await restarted.disable(false);
  expect(await (await restarted.fetch(request))!.text()).toBe("worker");
});

it("pulls streamed document bytes only when consumed and cancels the host stream", async () => {
  const sw = setup();
  sw.dispatch.mockImplementation(async (request: any) => {
    if (request.action === "pull")
      return { body: btoa("chunk"), done: false } as any;
    if (request.action === "cancel") return { done: true, body: "" } as any;
    return {
      url: "https://worker.example/live",
      status: 200,
      headers: {},
      body: "",
      streamId: "live",
    } as any;
  });
  const response = (await sw.fetch(new Request("https://localhost/live")))!;
  expect(sw.dispatch).toHaveBeenCalledTimes(1);
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe("chunk");
  await reader.cancel();
  expect(sw.dispatch).toHaveBeenLastCalledWith({
    action: "cancel",
    streamId: "live",
  });
});
