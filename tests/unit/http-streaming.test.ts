import { afterEach, expect, it, vi } from "vitest";
import { request } from "../../src/compat/node/http/index";
afterEach(() => vi.unstubAllGlobals());
it("starts sending before end and holds write callbacks until the consumer reads", async () => {
  let body!: ReadableStream<Uint8Array>;
  let respond!: (response: Response) => void;
  const fetcher = vi.fn((_url, init) => {
    body = init.body;
    return new Promise<Response>((resolve) => {
      respond = resolve;
    });
  });
  vi.stubGlobal("fetch", fetcher);
  const req = request("http://example.test/upload", { method: "POST" });
  req.on("error", () => {});
  const written = vi.fn();
  expect(req.write(new Uint8Array(128 * 1024), written)).toBe(false);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(written).not.toHaveBeenCalled();
  const reader = body.getReader();
  expect((await reader.read()).value?.byteLength).toBe(128 * 1024);
  await vi.waitFor(() => expect(written).toHaveBeenCalledOnce());
  req.end();
  expect((await reader.read()).done).toBe(true);
  respond(new Response(null, { status: 204 }));
});
it("destroy settles a blocked writer and errors the upload", async () => {
  let body!: ReadableStream<Uint8Array>;
  vi.stubGlobal(
    "fetch",
    vi.fn((_url, init) => {
      body = init.body;
      return new Promise(() => {});
    }),
  );
  const req = request("http://example.test/upload", { method: "POST" });
  req.on("error", () => {});
  const written = vi.fn();
  req.write(new Uint8Array(65536), written);
  req.destroy(new Error("stopped"));
  await vi.waitFor(() => expect(written).toHaveBeenCalledOnce());
  await expect(body.getReader().read()).rejects.toThrow("stopped");
  expect((req as any).upload).toBeUndefined();
});
it("releases queued writes on destroy", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  const req = request("http://example.test/upload", { method: "POST" });
  req.on("error", () => {});
  const callbacks = [vi.fn(), vi.fn(), vi.fn()];
  for (const callback of callbacks) req.write(new Uint8Array(65536), callback);
  req.destroy(new Error("stopped"));
  await vi.waitFor(() =>
    expect(
      callbacks.every((callback) => callback.mock.calls.length === 1),
    ).toBe(true),
  );
  expect(req.writableLength).toBe(0);
});
