import type { ContractResult } from "@rdlabo/capacitor-workers/testing";

// This runtime fixture is built by Vite. Build-tool tests separately exercise
// the configured Worker entry through both Vite and esbuild.
const nodeWorker = () =>
  new Worker(new URL("./entries/node.ts", import.meta.url), { type: "module" });

export function runNodeContractsInWorker(): Promise<ContractResult[]> {
  const worker = nodeWorker();
  return new Promise<ContractResult[]>((resolve, reject) => {
    worker.onmessage = (event) => resolve(event.data);
    worker.onerror = (event) => reject(event.error ?? new Error(event.message));
  }).finally(() => worker.terminate());
}
