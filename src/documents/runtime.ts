import {
  enableDocumentWorker,
  isDocumentWorker,
  registerDocumentWorker,
  stopDocumentWorker,
} from "./registration.js";
import { installDocumentHost, type DocumentRuntime } from "./host.js";
interface NativeBridge {
  getPlatform(): string;
  isPluginAvailable(name: string): boolean;
  nativePromise(
    name: string,
    method: string,
    options: unknown,
  ): Promise<unknown>;
}
function bridge(): NativeBridge | undefined {
  const host = (
    globalThis as typeof globalThis & {
      WorkersCapacitorHost?: { ready(): void };
    }
  ).WorkersCapacitorHost;
  if (
    host &&
    new URL(location.href).searchParams.has("__workers_capacitor_host")
  )
    return {
      getPlatform: () => "android",
      isPluginAvailable: (name) => name === "WorkersCapacitor",
      nativePromise: async (_name, method) => {
        if (method === "hostReady") host.ready();
      },
    };
  return (globalThis as typeof globalThis & { Capacitor?: NativeBridge })
    .Capacitor;
}
export function clearPreviousRendering() {
  if (bridge()?.getPlatform() === "android") return stopDocumentWorker();
}
export function validateRendering(render: string, baseURL: string) {
  const base = new URL(baseURL);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.pathname !== "/" ||
    base.search ||
    base.hash ||
    base.username ||
    base.password
  )
    throw new TypeError(
      "Document rendering requires an HTTP(S) origin as baseURL",
    );
  if (
    typeof render !== "string" ||
    !render.startsWith("/") ||
    render.startsWith("//") ||
    render.includes("\\") ||
    new URL(render, "https://local.invalid").origin !== "https://local.invalid"
  )
    throw new TypeError("render must be a local absolute path");
  if (!bridge() || !["ios", "android"].includes(bridge()!.getPlatform()))
    throw new Error("Document rendering currently requires native Capacitor");
  if (!bridge()!.isPluginAvailable("WorkersCapacitor"))
    throw new Error("WorkersCapacitor native integration is not installed");
}
export function startRendering(
  runtime: DocumentRuntime,
  render: string,
  baseURL: string,
  nativeFetch: typeof fetch,
) {
  const native = bridge()!;
  const uninstall = installDocumentHost(runtime, baseURL);
  let closed = false;
  const startup = new AbortController();
  let started = false;
  const call = (method: string, options: unknown = {}) =>
    native.nativePromise("WorkersCapacitor", method, options);
  const ready = (async () => {
    await runtime.ready;
    if (closed) throw new Error("Document rendering disposed");
    if (
      native.getPlatform() === "android" &&
      new URL(location.href).searchParams.has("__workers_capacitor_host")
    ) {
      await call("hostReady");
      return;
    }
    const response = await nativeFetch("/workers-capacitor-assets.json", {
      signal: startup.signal,
    });
    if (!response.ok)
      throw new Error(
        "Document assets are missing; build with workersCapacitorPlugin before Capacitor copy/sync",
      );
    const assets: unknown = await response.json();
    if (
      !Array.isArray(assets) ||
      assets.some((path) => typeof path !== "string" || !path.startsWith("/"))
    )
      throw new Error("Invalid document assets manifest");
    if (assets.includes(new URL(render, "https://local.invalid").pathname))
      throw new TypeError(
        "render must target a Worker route, not a bundled asset",
      );
    if (closed) throw new Error("Document rendering disposed");
    const pageScript =
      native.getPlatform() === "ios"
        ? (await import("./page-source.js")).pageScript
        : "";
    if (closed) throw new Error("Document rendering disposed");
    started = true;
    await call("start", {
      baseURL: new URL(baseURL).origin,
      entry: render,
      pageScript,
      assets,
      bootstrapURL: new URL(
        "/index.html?__workers_capacitor_host=1",
        location.href,
      ).href,
    });
    if (closed) throw new Error("Document rendering disposed");
    if (native.getPlatform() === "android") {
      const registration = await registerDocumentWorker(
        new URL(baseURL).origin,
      );
      await new Promise<void>((resolve, reject) => {
        const workers = navigator.serviceWorker;
        const finish = (error?: Error) => {
          clearTimeout(timer);
          workers.removeEventListener("controllerchange", controlled);
          startup.signal.removeEventListener("abort", aborted);
          error ? reject(error) : resolve();
        };
        const controlled = () => {
          if (
            !registration.installing &&
            !registration.waiting &&
            workers.controller === registration.active &&
            isDocumentWorker(workers.controller)
          )
            finish();
        };
        const aborted = () => finish(new Error("Document rendering disposed"));
        const timer = setTimeout(
          () => finish(new Error("Document Service Worker startup timed out")),
          15000,
        );
        workers.addEventListener("controllerchange", controlled);
        startup.signal.addEventListener("abort", aborted, { once: true });
        if (startup.signal.aborted) aborted();
        else workers.ready.then(controlled, (error) => finish(error));
      });
      if (closed) throw new Error("Document rendering disposed");
      await enableDocumentWorker();
      if (closed) throw new Error("Document rendering disposed");
      location.replace(render);
    }
  })();
  // A failed start must also release native resources. The installer restores fetch.
  const settled = ready.catch(async (error) => {
    uninstall();
    try {
      if (native.getPlatform() === "android") await stopDocumentWorker();
    } finally {
      if (started) {
        started = false;
        await call("stop").catch(() => {});
      }
    }
    throw error;
  });
  return {
    ready: settled,
    async dispose() {
      closed = true;
      startup.abort();
      uninstall();
      // Native stop also rejects Android's pending host-start call.
      try {
        if (started) {
          started = false;
          await call("stop");
        }
      } finally {
        await settled.catch(() => {});
        if (native.getPlatform() === "android") await stopDocumentWorker();
      }
    },
  };
}
