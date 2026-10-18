import { afterEach, describe, expect, it, vi } from "vitest";
import type { CapacitorWorkersOptions, WorkerHandler } from "../../src/index";

export type FetchContractOptions = Omit<
  CapacitorWorkersOptions<Record<string, unknown>>,
  "worker"
> & {
  worker: WorkerHandler<Record<string, unknown>>;
};
export interface FetchContractRuntime {
  fetch: typeof fetch;
  ready: Promise<void>;
  drain(): Promise<void>;
  dispose(): void;
}

/** Every execution adapter must pass these observable Fetch semantics. */
export function defineFetchContract(
  name: string,
  install: (options: FetchContractOptions) => FetchContractRuntime,
) {
  describe(name, () => {
    let runtime: FetchContractRuntime | undefined;
    const original = globalThis.fetch;
    afterEach(() => {
      runtime?.dispose();
      runtime = undefined;
      globalThis.fetch = original;
      vi.unstubAllGlobals();
    });

    it("matches path boundaries and origin, never falls back on 404", async () => {
      const network = vi.fn(async () => new Response("network"));
      globalThis.fetch = network;
      vi.stubGlobal("location", {
        href: "capacitor://localhost/",
        origin: "capacitor://localhost",
      });
      runtime = install({
        baseURL: "https://api.example/api/",
        worker: { fetch: () => new Response("missing", { status: 404 }) },
      });
      expect((await runtime.fetch("/api")).status).toBe(404);
      expect((await runtime.fetch("/api/items")).status).toBe(404);
      expect(await (await runtime.fetch("/apiary")).text()).toBe("network");
      expect(
        await (await runtime.fetch("https://other.example/api/items")).text(),
      ).toBe("network");
      expect(network).toHaveBeenCalledTimes(2);
    });
    it("preserves Request body, headers and init overrides", async () => {
      runtime = install({
        baseURL: "https://api.example/api",
        worker: {
          async fetch(req) {
            return Response.json({
              method: req.method,
              body: await req.text(),
              header: req.headers.get("x-test"),
              url: req.url,
            });
          },
        },
      });
      const request = new Request("https://api.example/api/items?q=1", {
        method: "POST",
        body: "hello",
      });
      expect(
        await (
          await runtime.fetch(request, { headers: { "x-test": "yes" } })
        ).json(),
      ).toEqual({
        method: "POST",
        body: "hello",
        header: "yes",
        url: "https://api.example/api/items?q=1",
      });
    });
    it("aborted requests do not execute and handler errors reject", async () => {
      const handler = vi.fn(() => {
        throw new Error("failure");
      });
      runtime = install({
        baseURL: "https://api.example/api",
        worker: { fetch: handler },
      });
      await expect(
        runtime.fetch("https://api.example/api", {
          signal: AbortSignal.abort(),
        }),
      ).rejects.toThrow();
      expect(handler).not.toHaveBeenCalled();
      await expect(runtime.fetch("https://api.example/api")).rejects.toThrow(
        "failure",
      );
    });
    it("rejects promptly when aborted while a handler is pending", async () => {
      let started!: () => void;
      const dispatched = new Promise<void>((resolve) => {
        started = resolve;
      });
      runtime = install({
        baseURL: "https://api.example/api",
        worker: {
          fetch: () => {
            started();
            return new Promise<Response>(() => {});
          },
        },
      });
      const controller = new AbortController();
      const response = runtime.fetch("https://api.example/api", {
        signal: controller.signal,
      });
      await dispatched;
      controller.abort();
      await expect(response).rejects.toThrow();
    });
    it("keeps the configured origin for paths starting with two slashes", async () => {
      vi.stubGlobal("location", { href: "capacitor://localhost/" });
      runtime = install({
        baseURL: "https://api.example/",
        worker: { fetch: (request) => Response.json({ url: request.url }) },
      });
      const response = await runtime.fetch(
        "capacitor://localhost//other.example/path?q=1",
      );
      expect(await response.json()).toEqual({
        url: "https://api.example//other.example/path?q=1",
      });
    });

    it("resolves relative URLs against document.baseURI and keeps the app origin boundary", async () => {
      vi.stubGlobal("location", { href: "https://localhost/screens/page" });
      vi.stubGlobal("document", { baseURI: "https://localhost/api/" });
      runtime = install({
        baseURL: "https://api.example/api",
        worker: { fetch: (req) => Response.json({ url: req.url }) },
      });
      expect(await (await runtime.fetch("items?q=1#fragment")).json()).toEqual({
        url: "https://api.example/api/items?q=1",
      });
    });

    it("rejects credentials instead of silently stripping them during URL mapping", async () => {
      const handler = vi.fn(() => new Response());
      runtime = install({
        baseURL: "https://api.example/api",
        worker: { fetch: handler },
      });
      await expect(
        runtime.fetch("https://user:password@api.example/api"),
      ).rejects.toThrow(TypeError);
      expect(handler).not.toHaveBeenCalled();
    });

    it("does not invoke the handler if aborted before its scheduled invocation", async () => {
      const handler = vi.fn(() => new Response());
      runtime = install({
        baseURL: "https://api.example/api",
        worker: { fetch: handler },
      });
      const controller = new AbortController();
      const response = runtime.fetch("https://api.example/api", {
        signal: controller.signal,
      });
      const reason = new Error("cancelled before dispatch");
      controller.abort(reason);
      await expect(response).rejects.toBe(reason);
      expect(handler).not.toHaveBeenCalled();
    });

    it("removes and cancels a standard handler's HEAD body, preserving status and headers", async () => {
      const cancel = vi.fn();
      runtime = install({
        baseURL: "https://api.example/api",
        worker: {
          fetch: () =>
            new Response(new ReadableStream({ cancel }), {
              status: 202,
              headers: { "x-test": "kept" },
            }),
        },
      });
      const response = await runtime.fetch("https://api.example/api", {
        method: "HEAD",
      });
      expect(response.status).toBe(202);
      expect(response.headers.get("x-test")).toBe("kept");
      expect(response.body).toBeNull();
      await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    });

    it.each(["used", "locked", "error"])(
      "rejects a %s response",
      async (kind) => {
        runtime = install({
          baseURL: "https://api.example/api",
          worker: {
            async fetch() {
              if (kind === "error") return Response.error();
              const response = new Response("body");
              if (kind === "used") await response.text();
              else response.body!.getReader();
              return response;
            },
          },
        });
        await expect(
          runtime.fetch("https://api.example/api"),
        ).rejects.toMatchObject({
          name: "TypeError",
        });
      },
    );

    it("delegates pre-installation outside Requests unchanged, including identity and init", async () => {
      const network = vi.fn(async () => new Response("network"));
      globalThis.fetch = network;
      const request = new Request("https://outside.example/api", {
        method: "POST",
        body: "body",
      });
      runtime = install({
        baseURL: "https://api.example/api",
        worker: { fetch: () => new Response() },
      });
      const init = { headers: { "x-test": "yes" } };
      await runtime.fetch(request, init);
      expect(network).toHaveBeenCalledWith(request, init);
      expect(request.bodyUsed).toBe(false);
    });

    it("injects env, gives each call its own context and drains nested background work", async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const completed: string[] = [];
      const errors = vi.fn();
      runtime = install({
        baseURL: "https://api.example/api",
        env: { label: "local" },
        onBackgroundError: errors,
        worker: {
          fetch(_req, env, ctx) {
            const reused = Object.hasOwn(ctx.props, "visited");
            ctx.props.visited = true;
            ctx.waitUntil(
              gate.then(() => {
                ctx.waitUntil(
                  Promise.resolve().then(() => {
                    completed.push("done");
                  }),
                );
              }),
            );
            ctx.waitUntil(Promise.reject(new Error("background")));
            return Response.json({ label: env.label, reused });
          },
        },
      });
      try {
        const values = await Promise.all(
          [1, 2].map(async () =>
            (await runtime!.fetch("https://api.example/api")).json(),
          ),
        );
        expect(values).toEqual([
          { label: "local", reused: false },
          { label: "local", reused: false },
        ]);
        expect(completed).toEqual([]);
      } finally {
        release();
      }
      await runtime.drain();
      expect(completed).toEqual(["done", "done"]);
      expect(errors).toHaveBeenCalledTimes(2);
    });

    it("rejects handler errors without retrying on the network", async () => {
      const network = vi.fn(async () => new Response("unexpected"));
      globalThis.fetch = network;
      runtime = install({
        baseURL: "https://api.example/api",
        worker: {
          fetch() {
            throw new TypeError("handler failed");
          },
        },
      });
      await expect(
        runtime.fetch("https://api.example/api"),
      ).rejects.toMatchObject({ name: "TypeError" });
      expect(network).not.toHaveBeenCalled();
    });
  });
}
