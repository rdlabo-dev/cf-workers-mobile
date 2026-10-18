import type { NativeCall } from "./native-network.js";

type Host = {
  cookiesGet(callback: string, url: string): void;
  cookiesSet(callback: string, url: string, cookies: string): void;
  socketWatch(callback: string, id: string): void;
  socketOpen(
    callback: string,
    id: string,
    host: string,
    port: number,
    tls: boolean,
  ): void;
  socketWrite(callback: string, id: string, chunk: string): void;
  socketEnd(callback: string, id: string): void;
  socketRead(callback: string, id: string, maxBytes: number): void;
  socketClose(callback: string, id: string): void;
};
const calls = new WeakMap<Host, NativeCall>();
/** Android's hidden document host has a JavaScript interface, not Capacitor JS. */
export function getHostCall(): NativeCall | undefined {
  const target = globalThis as typeof globalThis & {
    CapacitorWorkersHost?: Host;
    CapacitorWorkersHostCallback?: {
      deliver(id: string, success: boolean, value: unknown): void;
    };
  };
  const host = target.CapacitorWorkersHost;
  if (!host?.socketOpen) return;
  const existing = calls.get(host);
  if (existing) return existing;
  const pending = new Map<
    string,
    { resolve(value: unknown): void; reject(error: unknown): void }
  >();
  const callback = {
    deliver(id: string, success: boolean, value: unknown) {
      const operation = pending.get(id);
      if (!operation) return;
      pending.delete(id);
      if (success) operation.resolve(value);
      else
        operation.reject(
          new Error(
            String(
              (value as { message?: string })?.message ??
                "Native network failed",
            ),
          ),
        );
    },
  };
  if (target.CapacitorWorkersHostCallback)
    throw new Error("Native network callback is already installed");
  target.CapacitorWorkersHostCallback = callback;
  const call: NativeCall = (_plugin, method, args) =>
    new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      pending.set(id, { resolve, reject });
      try {
        const handle = String(args.id);
        switch (method) {
          case "cookiesGet":
            host.cookiesGet(id, String(args.url));
            break;
          case "cookiesSet":
            host.cookiesSet(id, String(args.url), JSON.stringify(args.cookies));
            break;
          case "socketWatch":
            host.socketWatch(id, handle);
            break;
          case "socketOpen":
            host.socketOpen(
              id,
              handle,
              String(args.host),
              Number(args.port),
              args.tls === true,
            );
            break;
          case "socketWrite":
            host.socketWrite(id, handle, String(args.chunk));
            break;
          case "socketEnd":
            host.socketEnd(id, handle);
            break;
          case "socketRead":
            host.socketRead(id, handle, Number(args.maxBytes));
            break;
          case "socketClose":
            host.socketClose(id, handle);
            break;
        }
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  calls.set(host, call);
  return call;
}
