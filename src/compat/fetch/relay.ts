import { createNetworkScope } from "./scope.js";
import {
  getNativeCall,
  setNativeCall,
  type NativeCall,
  type NativeNetworkMethod,
} from "./native-network.js";

const methods = new Set<NativeNetworkMethod>([
  "socketWatch",
  "socketOpen",
  "socketWrite",
  "socketEnd",
  "socketRead",
  "socketClose",
]);
const connect = "workers-capacitor:network";

/** The parent owns native handles even if the worker crashes or is terminated. */
export function createNetworkRelay(worker: Worker) {
  const native = getNativeCall();
  const scope = native ? createNetworkScope(native) : undefined;
  let port: MessagePort | undefined;
  let disposed = false;
  const receive = (event: MessageEvent) => {
    if (event.data?.type !== connect) return;
    const received = event.ports[0];
    if (!received) return;
    if (disposed || port) {
      received.close();
      return;
    }
    port = received;
    received.onmessage = async ({ data }) => {
      if (disposed || !scope) return;
      const { id, method, args } = data ?? {};
      if (
        typeof id !== "number" ||
        !methods.has(method) ||
        typeof args !== "object" ||
        args === null
      )
        return;
      try {
        const value = await scope.call("WorkersCapacitor", method, args);
        if (!disposed) received.postMessage({ id, value });
      } catch (error) {
        if (!disposed) received.postMessage({ id, error: String(error) });
      }
    };
    received.postMessage({ available: !!scope });
  };
  return {
    receive,
    dispose() {
      disposed = true;
      port?.close();
      return scope?.dispose();
    },
  };
}

/** Runs before evaluating the user module, so top-level outbound fetch is ready. */
export async function initializeWorkerNetwork() {
  const { port1, port2 } = new MessageChannel();
  let next = 0;
  const pending = new Map<
    number,
    { resolve(value: unknown): void; reject(error: unknown): void }
  >();
  const available = await new Promise<boolean>((resolve, reject) => {
    port1.onmessageerror = () =>
      reject(new Error("Native network handshake failed"));
    port1.onmessage = ({ data }) => resolve(data.available === true);
    self.postMessage({ type: connect }, { transfer: [port2] });
  });
  if (!available) {
    port1.close();
    return;
  }
  port1.onmessage = ({ data }) => {
    const operation = pending.get(data.id);
    if (!operation) return;
    pending.delete(data.id);
    if (typeof data.error === "string") operation.reject(new Error(data.error));
    else operation.resolve(data.value);
  };
  port1.onmessageerror = () => {
    for (const operation of pending.values())
      operation.reject(
        new Error("Native network response could not be decoded"),
      );
    pending.clear();
  };
  const call: NativeCall = (_plugin, method, args) =>
    new Promise((resolve, reject) => {
      const id = ++next;
      pending.set(id, { resolve, reject });
      try {
        port1.postMessage({ id, method, args });
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  setNativeCall(call);
}
