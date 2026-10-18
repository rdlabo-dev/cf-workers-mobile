const NativeAbortSignal = globalThis.AbortSignal;
const nativeTimeout = NativeAbortSignal.timeout.bind(NativeAbortSignal);
export const AbortController = globalThis.AbortController;

// workerd accepts a double and clamps its timers to 100 years, unlike the
// browser's unsigned-long-long conversion. Keep native signal branding.
export function timeout(milliseconds: number): AbortSignal {
  if (arguments.length === 0)
    throw new TypeError("AbortSignal.timeout requires a delay");
  const value = +milliseconds;
  const delay =
    Number.isNaN(value) || value <= 0
      ? 0
      : Math.min(Math.trunc(value), 3153600000000);
  return nativeTimeout(delay);
}

// A side-effect-free view for shared contracts. Public runtime installation
// patches only the static method, preserving constructor/prototype identity.
export const AbortSignal = new Proxy(NativeAbortSignal, {
  get(target, key, receiver) {
    return key === "timeout" ? timeout : Reflect.get(target, key, receiver);
  },
});

const installations = new WeakMap<
  typeof globalThis.AbortSignal,
  {
    owners: number;
    previous: PropertyDescriptor | undefined;
    installed: PropertyDescriptor;
  }
>();
export function installAbortTimeout(
  target: typeof globalThis.AbortSignal | undefined,
) {
  if (!target) return () => {};
  const owns = (descriptor: PropertyDescriptor) => {
    const current = Object.getOwnPropertyDescriptor(target, "timeout");
    return (
      current?.value === descriptor.value &&
      current?.configurable === descriptor.configurable &&
      current?.enumerable === descriptor.enumerable &&
      current?.writable === descriptor.writable
    );
  };
  let installation = installations.get(target);
  if (installation) {
    if (!owns(installation.installed))
      throw new Error(
        "Workers AbortSignal.timeout changed during installation",
      );
    installation.owners++;
  } else {
    const previous = Object.getOwnPropertyDescriptor(target, "timeout");
    const installed = {
      configurable: true,
      enumerable: previous?.enumerable ?? true,
      writable: true,
      value: timeout,
    };
    Object.defineProperty(target, "timeout", installed);
    installation = { owners: 1, previous, installed };
    installations.set(target, installation);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--installation.owners) return;
    installations.delete(target);
    if (!owns(installation.installed)) return;
    if (installation.previous)
      Object.defineProperty(target, "timeout", installation.previous);
    else Reflect.deleteProperty(target, "timeout");
  };
}
