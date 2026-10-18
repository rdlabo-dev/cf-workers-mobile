import { assertLocalRuntime } from "./environment.js";
export {
  getExecutionEnvironment,
  type ExecutionEnvironment,
} from "./environment.js";
import {
  clearPreviousRendering,
  startRendering,
  validateRendering,
} from "./browser/documents/runtime.js";
import { createFetchRuntime } from "./cloudflare/workers/worker-runtime.js";
import type { WorkersCapacitorOptions } from "./cloudflare/workers/types.js";
export type {
  WorkersCapacitorOptions,
  WorkerContext,
  WorkerFactory,
  WorkerSource,
  LoadedWorker,
  ExecutionPreference,
  WorkerHandler,
  RemoteWorkerOptions,
} from "./cloudflare/workers/types.js";
export {
  FetchRuntime,
  type FetchRuntimeOptions,
} from "./cloudflare/workers/runtime.js";

let installed = false;

/** Installs synchronously; await ready before local requests. Does not start a server. */
export function workersCapacitor<Env = Record<string, unknown>>(
  options: WorkersCapacitorOptions<Env>,
) {
  assertLocalRuntime();
  if (installed)
    throw new Error("workersCapacitor is already installed; dispose it first.");
  if (options.render !== undefined)
    validateRendering(options.render, options.baseURL);
  const original = globalThis.fetch;
  const runtime = createFetchRuntime(options);
  globalThis.fetch = runtime.fetch;
  installed = true;
  let disposed = false;
  let disposal: Promise<void> | undefined;
  let documents: ReturnType<typeof startRendering> | undefined;
  try {
    documents =
      options.render === undefined
        ? undefined
        : startRendering(
            runtime,
            options.render,
            options.baseURL,
            original.bind(globalThis),
          );
  } catch (error) {
    globalThis.fetch = original;
    const cleanup = runtime.dispose();
    if (cleanup)
      void cleanup
        .finally(() => {
          installed = false;
        })
        .catch(console.error);
    else installed = false;
    throw error;
  }
  const releaseInstallation = async (error: unknown): Promise<never> => {
    if (!disposed) {
      if (globalThis.fetch === runtime.fetch) globalThis.fetch = original;
      disposed = true;
      disposal = Promise.resolve(runtime.dispose()).finally(() => {
        installed = false;
      });
    }
    try {
      await disposal;
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Startup and cleanup failed",
      );
    }
    throw error;
  };
  const previousRendering = documents
    ? undefined
    : clearPreviousRendering()?.catch(releaseInstallation);
  // Fetch-only startup failures remain installed and reject local requests until
  // explicitly disposed. Only document setup/migration failures roll back setup.
  const ready = documents
    ? documents.ready.catch(releaseInstallation)
    : previousRendering
      ? Promise.allSettled([runtime.ready, previousRendering]).then(
          (results) => {
            for (const result of results)
              if (result.status === "rejected") throw result.reason;
          },
        )
      : runtime.ready;
  return {
    ready,
    get execution() {
      return runtime.execution;
    },
    drain: () => runtime.drain(),
    dispose(): void | Promise<void> {
      if (disposed) return disposal;
      if (globalThis.fetch !== runtime.fetch)
        throw new Error(
          "fetch changed after installation; restore it before disposing.",
        );
      const runtimeDisposal = runtime.dispose();
      globalThis.fetch = original;
      disposed = true;
      const pending = [
        runtimeDisposal,
        documents?.dispose(),
        previousRendering,
      ].filter((value): value is Promise<void> => value !== undefined);
      if (pending.length) {
        disposal = Promise.allSettled(pending)
          .then((results) => {
            const errors = results.flatMap((result) =>
              result.status === "rejected" ? [result.reason] : [],
            );
            if (errors.length === 1) throw errors[0];
            if (errors.length)
              throw new AggregateError(errors, "Runtime cleanup failed");
          })
          .finally(() => {
            installed = false;
          });
        return disposal;
      }
      installed = false;
    },
  };
}
