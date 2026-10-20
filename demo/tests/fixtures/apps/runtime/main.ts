import { kvRequest } from "../../../validation/kv";
import { runFeatures } from "../../../validation/run-features";
import { Capacitor } from "@capacitor/core";
import { workersCapacitor } from "workers-capacitor";
import { runFrameworkContract } from "./frameworks";

const isolation = () =>
  new Worker(
    new URL("../../../validation/entries/isolation.ts", import.meta.url),
    { type: "module" },
  );
const hono = () =>
  new Worker(new URL("../../../validation/entries/hono.ts", import.meta.url), {
    type: "module",
  });
const express = () =>
  new Worker(
    new URL("../../../validation/entries/express.ts", import.meta.url),
    { type: "module" },
  );

export type Framework = "hono" | "express";
export function startExperiment(
  upstream: string,
  baseURL = `${upstream}/api`,
  framework?: Framework,
) {
  const errors: string[] = [];
  const runtime = workersCapacitor({
    worker:
      framework === "hono"
        ? hono
        : framework === "express"
          ? express
          : isolation,
    baseURL,
    env: { UPSTREAM: upstream },
    onBackgroundError: (error) => errors.push(String(error)),
  });
  return {
    errors,
    ready: runtime.ready,
    drain: runtime.drain,
    dispose: runtime.dispose,
  };
}
declare global {
  interface Window {
    runFeatures: typeof runFeatures;
    startExperiment: typeof startExperiment;
    experiment: ReturnType<typeof startExperiment>;
    runFrameworkContract: typeof runFrameworkContract;
  }
}
window.startExperiment = startExperiment;
window.runFrameworkContract = runFrameworkContract;

if (Capacitor.isNativePlatform()) {
  void import("./native").then(({ runNativeExperiment }) =>
    runNativeExperiment(),
  );
}

window.runFeatures = runFeatures;

Object.assign(window, { kvRequest });

export function startPreferred(
  prefer?: "worker" | "direct",
  env: Record<string, unknown> = {},
) {
  return workersCapacitor({
    baseURL: "https://preferred.example/api",
    prefer,
    env,
  });
}
declare global {
  interface Window {
    startPreferred: typeof startPreferred;
  }
}
window.startPreferred = startPreferred;

export function startStartupProbe() {
  return workersCapacitor({
    baseURL: "https://preferred.example/api",
    prefer: "direct",
    worker: {
      createWorker: () => {
        throw new Error("Direct-only regression fixture");
      },
      loadDirect: async () =>
        (await import("../../workers/runtime/direct-startup-fetch")).default,
    },
  });
}
export function startDelayedDirect() {
  let dispatched = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const runtime = workersCapacitor({
    baseURL: "https://preferred.example/api",
    prefer: "direct",
    worker: {
      createWorker: () => {
        throw new Error("Direct-only regression fixture");
      },
      loadDirect: async () => {
        await gate;
        const worker = (await import("../../workers/runtime/isolation"))
          .default;
        return {
          fetch(...args: Parameters<typeof worker.fetch>) {
            dispatched++;
            return worker.fetch(...args);
          },
        };
      },
    },
  });
  return { runtime, release, dispatched: () => dispatched };
}
declare global {
  interface Window {
    startStartupProbe: typeof startStartupProbe;
    startDelayedDirect: typeof startDelayedDirect;
  }
}
window.startStartupProbe = startStartupProbe;
window.startDelayedDirect = startDelayedDirect;
