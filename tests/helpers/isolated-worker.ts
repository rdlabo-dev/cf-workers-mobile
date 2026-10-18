import { vi } from "vitest";
import type { WorkerHandler } from "../../src/index";
import type { Invocation } from "../../src/runtime/isolated/protocol";
import { serve } from "../../src/runtime/isolated/transport";

// Exercise the actual two transport endpoints over native MessageChannels.
// Browser/native suites separately verify real Dedicated Worker execution.
export function workerFor<Env>(handler: WorkerHandler<Env>) {
  const ports: MessagePort[] = [];
  const client = {
    onmessage: null as null | ((event: { data: unknown }) => void),
    onerror: null as
      | null
      | ((event: { message: string; preventDefault(): void }) => void),
    postMessage(data: Invocation, transfer: Transferable[]) {
      const cloned = structuredClone(data, { transfer });
      ports.push(cloned.port);
      void scope.onmessage({ data: cloned });
    },
    terminate: vi.fn(() => ports.forEach((port) => port.close())),
  };
  const scope = {
    onmessage: (_event: { data: unknown }): unknown => undefined,
    postMessage(data: unknown) {
      queueMicrotask(() => client.onmessage?.({ data }));
    },
  };
  vi.stubGlobal("self", scope);
  serve(handler as WorkerHandler<unknown>);
  return client;
}
