import {
  getNativeCall,
  setNativeCall,
  type NativeCall,
} from "./native-network.js";

/** Host-side owner; it survives termination of the Dedicated Worker it serves. */
export function createNetworkScope(nativeCall: NativeCall) {
  const handles = new Set<string>();
  const closing = new Map<string, Promise<void>>();
  let disposal: Promise<void> | undefined;
  let rejectStopped!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => {
    rejectStopped = reject;
  });
  void stopped.catch(() => {});
  const close = (id: string): Promise<void> => {
    const existing = closing.get(id);
    if (existing) return existing;
    const promise = Promise.resolve()
      .then(() => nativeCall("WorkersCapacitor", "socketClose", { id }))
      .then(() => {
        handles.delete(id);
        closing.delete(id);
      });
    closing.set(id, promise);
    return promise;
  };
  const call: NativeCall = (plugin, method, args) => {
    if (disposal) return Promise.reject(new Error("Network runtime disposed"));
    if (plugin !== "WorkersCapacitor" || typeof args.id !== "string")
      return Promise.reject(new TypeError("Invalid network call"));
    const id = args.id;
    const opening = method === "socketOpen";
    const shutting = method === "socketClose";
    if (opening) {
      if (handles.has(id))
        return Promise.reject(new Error("Duplicate network handle"));
      handles.add(id);
    } else if (!handles.has(id)) {
      return shutting
        ? Promise.resolve()
        : Promise.reject(new Error("Unknown network handle"));
    }
    let operation: Promise<unknown>;
    try {
      operation = shutting ? close(id) : nativeCall(plugin, method, args);
    } catch (error) {
      if (opening) handles.delete(id);
      return Promise.reject(error);
    }
    const tracked = operation.then(
      async (result) => {
        // Also cover an injected bridge that schedules registration later than
        // close. Never hand a late opening response to a replacement runtime.
        if (opening && (disposal || !handles.has(id))) {
          await close(id);
          throw new Error("Network handle closed before opening completed");
        }
        return result;
      },
      async (error) => {
        if (opening) await close(id);
        throw error;
      },
    );
    return Promise.race([tracked, stopped]);
  };
  return {
    call,
    dispose() {
      if (!disposal) {
        rejectStopped(new Error("Network runtime disposed"));
        // Set ownership closed before calling an external bridge, which may
        // synchronously invoke application code.
        disposal = Promise.resolve().then(async () => {
          const results = await Promise.allSettled(
            [...handles].map((id) => close(id)),
          );
          const errors = results.flatMap((result) =>
            result.status === "rejected" ? [result.reason] : [],
          );
          if (errors.length)
            throw new AggregateError(errors, "Native network cleanup failed");
        });
      }
      return disposal;
    },
  };
}

let directOwner: object | undefined;
/** The public installer permits one direct runtime per page. */
export function installDirectNetworkScope(): (() => Promise<void>) | undefined {
  const nativeCall = getNativeCall();
  if (!nativeCall) return;
  if (directOwner)
    throw new Error("A direct native network runtime is already installed");
  const owner = {};
  directOwner = owner;
  const scope = createNetworkScope(nativeCall);
  const restore = setNativeCall(scope.call);
  let disposal: Promise<void> | undefined;
  return () => {
    if (!disposal) {
      restore();
      disposal = scope.dispose().finally(() => {
        if (directOwner === owner) directOwner = undefined;
      });
    }
    return disposal;
  };
}
