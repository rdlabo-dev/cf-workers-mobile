import { describe, expect, it, vi } from "vitest";
import { createSecureClient } from "./index.js";

describe("createSecureClient", () => {
  const baseURL = "https://api.example.com/v1/";

  it("keeps relative paths under the configured API root", async () => {
    const send = vi.fn(async (request: Request) => new Response(request.url));
    const client = createSecureClient({ baseURL, fetch: send as typeof fetch });
    expect(await (await client.fetch("/users/1")).text()).toBe(
      "https://api.example.com/v1/users/1",
    );
  });

  it("rejects cross-origin, path escapes, and insecure base URLs", async () => {
    const send = vi.fn(async () => new Response("ok"));
    const client = createSecureClient({ baseURL, fetch: send });
    for (const url of [
      "https://evil.example/users",
      "//evil.example/users",
      "../admin",
      "https://api.example.com/v1-evil/path",
    ])
      await expect(client.fetch(url)).rejects.toThrow(TypeError);
    expect(send).not.toHaveBeenCalled();
    expect(() =>
      createSecureClient({ baseURL: "http://api.example.com/" }),
    ).toThrow(TypeError);
  });

  it("gets a user token for each request and leaves 401 to the caller", async () => {
    let token = "first";
    const send = vi.fn(async (request: Request) => {
      expect(request.redirect).toBe("manual");
      expect(request.headers.get("Authorization")).toBe(`Bearer ${token}`);
      return new Response(null, { status: 401 });
    });
    const client = createSecureClient({
      baseURL,
      authProvider: { getToken: async () => token },
      fetch: send as typeof fetch,
    });
    expect((await client.fetch("users")).status).toBe(401);
    token = "second";
    expect((await client.fetch("users")).status).toBe(401);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("supports anonymous requests and preserves Request bodies and signals", async () => {
    const controller = new AbortController();
    const send = vi.fn(async (request: Request) => {
      expect(request.headers.has("Authorization")).toBe(false);
      expect(request.headers.get("X-Custom")).toBe("yes");
      expect(request.signal.aborted).toBe(false);
      return new Response(await request.text());
    });
    const client = createSecureClient({
      baseURL,
      authProvider: { getToken: async () => undefined },
      fetch: send as typeof fetch,
    });
    const input = new Request("https://api.example.com/v1/users", {
      method: "POST",
      body: "hello",
      signal: controller.signal,
      headers: { "X-Custom": "yes" },
    });
    expect(await (await client.fetch(input)).text()).toBe("hello");
    expect(input.bodyUsed).toBe(false);
  });

  it("allows cookie credentials as an opt-in", async () => {
    const send = vi.fn(async (request: Request) => {
      expect(request.credentials).toBe("include");
      return new Response("ok");
    });
    const client = createSecureClient({
      baseURL,
      credentials: "include",
      fetch: send as typeof fetch,
    });
    await client.fetch("me");
  });

  it("does not follow redirects or retry a failed write", async () => {
    const send = vi.fn(async (request: Request) => {
      expect(request.redirect).toBe("manual");
      expect(request.method).toBe("POST");
      return new Response(null, {
        status: 302,
        headers: { Location: "https://evil.example/collect" },
      });
    });
    const client = createSecureClient({
      baseURL,
      authProvider: { getToken: async () => "user-token" },
      fetch: send as typeof fetch,
    });
    expect(
      (await client.fetch("users", { method: "POST", body: "data" })).status,
    ).toBe(302);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
