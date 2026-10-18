/** Runtime identity, not the presence of a browser Worker constructor. */
export type ExecutionEnvironment =
  | "cloudflare-workers"
  | "capacitor"
  | "browser-worker"
  | "browser"
  | "unknown";
export function getExecutionEnvironment(): ExecutionEnvironment {
  // workerd exposes this identity through its Navigator implementation. A
  // DedicatedWorkerGlobalScope is a browser realm, not Cloudflare Workers.
  if (globalThis.navigator?.userAgent === "Cloudflare-Workers")
    return "cloudflare-workers";
  const host = globalThis as typeof globalThis & {
    Capacitor?: { isNativePlatform?: () => boolean };
    WorkerGlobalScope?: { prototype: object };
  };
  if (host.Capacitor?.isNativePlatform?.()) return "capacitor";
  if (host.WorkerGlobalScope?.prototype.isPrototypeOf(globalThis))
    return "browser-worker";
  if (typeof document !== "undefined") return "browser";
  return "unknown";
}
export function assertLocalRuntime() {
  if (getExecutionEnvironment() === "cloudflare-workers")
    throw new Error(
      "Capacitor runtime installation is unavailable in Cloudflare Workers; export the original Worker handler there.",
    );
}
