import { afterEach, expect, it, vi } from "vitest";
import { LocalAssets } from "../../src/features/assets/index.js";
import { platform } from "../../src/compat/globals/platform.js";
import { createFetchRuntime } from "../../src/fetch/worker-runtime.js";
const options = { baseURL: "capacitor://localhost/app/" };
afterEach(() => vi.restoreAllMocks());
it("loads only a manifest-selected file, ignoring request host/query and credentials", async () => {
  const send = vi.spyOn(platform, "fetch").mockResolvedValue(
    new Response("hello", {
      headers: {
        "content-type": "text/html",
        "set-cookie": "secret=1",
        "content-encoding": "gzip",
        "content-length": "999",
      },
    }),
  );
  const assets = new LocalAssets(
    { "/": "index.html", "/logo.svg": "logo.hash.svg" },
    options,
  );
  expect(send).not.toHaveBeenCalled();
  const response = await assets.fetch(
    new Request("https://ignored.example/?private=query", {
      headers: { authorization: "secret", cookie: "private=1" },
    }),
  );
  expect(await response.text()).toBe("hello");
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0]).toBe("capacitor://localhost/app/index.html");
  expect(send.mock.calls[0][1]).toMatchObject({
    credentials: "omit",
    redirect: "error",
    method: "GET",
  });
  expect(send.mock.calls[0][1]?.headers).toBeUndefined();
  expect(response.headers.get("content-type")).toBe("text/html");
  expect(response.headers.has("set-cookie")).toBe(false);
  expect(response.headers.has("content-encoding")).toBe(false);
  expect(response.headers.has("content-length")).toBe(false);
});
it("returns 404/405 without IO and supports explicit SPA fallback", async () => {
  const send = vi
    .spyOn(platform, "fetch")
    .mockImplementation(async () => new Response("SPA"));
  const assets = new LocalAssets({ "/index.html": "index.html" }, options);
  expect((await assets.fetch("https://any.invalid/missing")).status).toBe(404);
  expect(
    (await assets.fetch("https://any.invalid/index.html", { method: "POST" }))
      .status,
  ).toBe(405);
  expect(send).not.toHaveBeenCalled();
  const spa = new LocalAssets(
    { "/index.html": "index.html" },
    { ...options, notFoundHandling: "single-page-application" },
  );
  expect(
    await (await spa.fetch("https://any.invalid/nested/route")).text(),
  ).toBe("SPA");
});
it("rejects unsafe manifest paths, remote assets and unsupported profiles", () => {
  for (const path of [
    "relative",
    "//evil.example/x",
    "/a/../b",
    "/x?query",
    "/x#hash",
    "/%2Fetc",
    "/%00",
  ]) {
    expect(() => new LocalAssets({ [path]: "index.html" }, options)).toThrow(
      "Invalid LocalAssets path",
    );
  }
  for (const value of [
    "https://evil.example/x",
    "capacitor://evil/x",
    "capacitor://user:pass@localhost/x",
    "data:text/html,test",
  ])
    expect(() => new LocalAssets({ "/": value }, options)).toThrow(
      "app asset origin",
    );
  expect(
    () =>
      new LocalAssets(
        {},
        { ...options, notFoundHandling: "single-page-application" },
      ),
  ).toThrow("/index.html");
});
it("does not pretend to support conditional or range requests", async () => {
  const send = vi.spyOn(platform, "fetch");
  const assets = new LocalAssets({ "/": "index.html" }, options);
  for (const name of [
    "range",
    "if-range",
    "if-none-match",
    "if-match",
    "if-modified-since",
    "if-unmodified-since",
  ])
    await expect(
      assets.fetch("https://any.invalid/", { headers: { [name]: "value" } }),
    ).rejects.toThrow(name);
  expect(send).not.toHaveBeenCalled();
});
it("HEAD returns no body and cancels a platform's empty stream", async () => {
  const cancel = vi.fn();
  const send = vi.spyOn(platform, "fetch").mockResolvedValue(
    new Response(new ReadableStream({ cancel }), {
      headers: { "content-length": "10" },
    }),
  );
  const assets = new LocalAssets({ "/": "index.html" }, options);
  const response = await assets.fetch("https://any.invalid/", {
    method: "HEAD",
  });
  expect(response.body).toBeNull();
  expect(response.headers.get("content-length")).toBe("10");
  expect(send.mock.calls[0][1]?.method).toBe("HEAD");
  expect(cancel).toHaveBeenCalledOnce();
});
it("streams without eager buffering and propagates cancellation", async () => {
  const cancel = vi.fn();
  let pulls = 0;
  const body = new ReadableStream(
    {
      pull(controller) {
        pulls++;
        controller.enqueue(new Uint8Array([1, 2, 3]));
      },
      cancel,
    },
    { highWaterMark: 0 },
  );
  vi.spyOn(platform, "fetch").mockResolvedValue(new Response(body));
  const assets = new LocalAssets({ "/": "index.html" }, options);
  const response = await assets.fetch("https://any.invalid/");
  expect(pulls).toBe(0);
  const reader = response.body!.getReader();
  expect((await reader.read()).value).toEqual(new Uint8Array([1, 2, 3]));
  await reader.cancel("done");
  expect(cancel).toHaveBeenCalledWith("done");
});
it("fails missing packaged files rather than masking packaging errors with SPA content", async () => {
  const send = vi
    .spyOn(platform, "fetch")
    .mockResolvedValue(new Response("missing", { status: 404 }));
  const assets = new LocalAssets({ "/": "missing.html" }, options);
  await expect(assets.fetch("https://any.invalid/")).rejects.toThrow(
    "Packaged asset unavailable (404)",
  );
  expect(send).toHaveBeenCalledOnce();
  const controller = new AbortController();
  controller.abort();
  await expect(
    assets.fetch("https://any.invalid/", { signal: controller.signal }),
  ).rejects.toThrow();
  expect(send).toHaveBeenCalledOnce();
});
it("runtime uses direct execution for LocalAssets and selects remote before invoking the binding", async () => {
  const assets = new LocalAssets({ "/": "index.html" }, options);
  const local = vi
    .spyOn(assets, "fetch")
    .mockResolvedValue(new Response("local"));
  const handler = {
    fetch: (request: Request, env: { ASSETS: LocalAssets }) =>
      env.ASSETS.fetch(request),
  };
  const remoteSend = vi.fn(async () => new Response("remote"));
  vi.stubGlobal("fetch", remoteSend);
  const createWorker = vi.fn();
  const runtime = createFetchRuntime({
    baseURL: "https://local.invalid",
    prefer: "worker",
    env: { ASSETS: assets },
    remote: { origin: "https://cloud.invalid" },
    worker: {
      createWorker,
      loadDirect: async () => handler,
      needsRemote: (request: Request) =>
        new URL(request.url).pathname === "/cloud",
    },
  });
  try {
    await runtime.ready;
    expect(runtime.execution).toBe("direct");
    expect(createWorker).not.toHaveBeenCalled();
    expect(
      await (await runtime.fetch("https://local.invalid/cloud")).text(),
    ).toBe("remote");
    expect(local).not.toHaveBeenCalled();
    expect(await (await runtime.fetch("https://local.invalid/")).text()).toBe(
      "local",
    );
  } finally {
    await runtime.dispose();
    vi.unstubAllGlobals();
  }
});
