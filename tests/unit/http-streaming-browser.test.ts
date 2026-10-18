import { expect, it, vi } from "vitest";
vi.mock(
  "node:stream",
  // @ts-expect-error The browser-only readable-stream entry has no declarations.
  async () => import("readable-stream/lib/ours/browser.js"),
);
import { request } from "../../src/compat/node/http/index";
it("finishes an upload using the browser Writable implementation", async () => {
  vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
    const data = await new Response(init.body).text();
    return new Response(data);
  });
  try {
    const response = await new Promise<any>((resolve, reject) => {
      const req = request("http://example.test/", { method: "POST" }, resolve);
      req.on("error", reject);
      req.end("payload");
    });
    let body = "";
    for await (const chunk of response) body += chunk;
    expect(body).toBe("payload");
  } finally {
    vi.unstubAllGlobals();
  }
});

it("closes a request when finalization rejects its mutated path", async () => {
  const req = request("http://example.test/");
  req.path = "//other.test/";
  const error = new Promise<Error>((resolve) => req.once("error", resolve));
  const closed = new Promise<void>((resolve) => req.once("close", resolve));
  req.end();
  expect(((await error) as Error & { code: string }).code).toBe(
    "ERR_INVALID_ARG_VALUE",
  );
  await closed;
});
