import { workersCapacitor } from "./index.js";
import type { WorkersCapacitorOptions } from "./cloudflare/workers/types.js";

type NativeHost = typeof globalThis & {
  __workersNativeDispose?: () => Promise<void>;
  WorkersNativeHost?: { failed(message: string): void };
};

/** Shared entry for SDK-owned hosts; the handle belongs to this runtime realm. */
export function workersNative<Env = Record<string, unknown>>(
  options: WorkersCapacitorOptions<Env>,
) {
  const host = globalThis as NativeHost;
  if (host.__workersNativeDispose)
    throw new Error("A native Workers runtime is already installed.");
  const failed = (error: unknown) => {
    try {
      host.WorkersNativeHost?.failed(
        error instanceof Error ? error.message : String(error),
      );
    } catch {
      // Native failure reporting must not replace the original startup error.
    }
  };
  let app: ReturnType<typeof workersCapacitor<Env>>;
  try {
    app = workersCapacitor(options);
  } catch (error) {
    failed(error);
    throw error;
  }
  let closing: Promise<void> | undefined;
  const dispose = () => {
    if (closing) return closing;
    // Retain ownership when disposal throws before it can release the runtime.
    const pending = app.dispose();
    closing = Promise.resolve(pending).finally(() => {
      if (host.__workersNativeDispose === dispose)
        delete host.__workersNativeDispose;
    });
    return closing;
  };
  host.__workersNativeDispose = dispose;
  const ready = app.ready.catch(async (error: unknown) => {
    try {
      await dispose();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Native startup and cleanup failed",
      );
    } finally {
      failed(error);
    }
    throw error;
  });
  return {
    ready,
    get execution() {
      return app.execution;
    },
    drain: app.drain,
    dispose,
  };
}
