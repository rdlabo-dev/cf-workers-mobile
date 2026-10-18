import {
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
} from "node:timers";
const values = { setTimeout, clearTimeout, setInterval, clearInterval };
type Target = Record<string, unknown>;
type Name = keyof typeof values;
type Patch = { previous?: PropertyDescriptor; installed: PropertyDescriptor };
const owners = new WeakMap<
  Target,
  { count: number; patches: Map<Name, Patch> }
>();
function owns(target: Target, name: Name, expected: PropertyDescriptor) {
  const actual = Object.getOwnPropertyDescriptor(target, name);
  return (
    actual?.value === expected.value &&
    actual?.configurable === expected.configurable &&
    actual?.enumerable === expected.enumerable &&
    actual?.writable === expected.writable
  );
}
function restore(target: Target, patches: Map<Name, Patch>) {
  for (const [name, patch] of patches)
    if (owns(target, name, patch.installed)) {
      if (patch.previous) Object.defineProperty(target, name, patch.previous);
      else Reflect.deleteProperty(target, name);
    }
}
/** The pinned Workers profile exposes these Node timer functions globally. */
export function installTimerGlobals(target: Target = globalThis) {
  let owner = owners.get(target);
  if (owner) {
    for (const [name, patch] of owner.patches)
      if (!owns(target, name, patch.installed))
        throw new Error(`Workers timer ${name} changed during installation`);
    owner.count++;
  } else {
    const patches = new Map<Name, Patch>();
    try {
      for (const name of Object.keys(values) as Name[]) {
        const previous = Object.getOwnPropertyDescriptor(target, name);
        const installed = {
          value: values[name],
          configurable: true,
          enumerable: previous?.enumerable ?? false,
          writable: true,
        };
        Object.defineProperty(target, name, installed);
        patches.set(name, { previous, installed });
      }
    } catch (error) {
      restore(target, patches);
      throw error;
    }
    owner = { count: 1, patches };
    owners.set(target, owner);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--owner.count) return;
    owners.delete(target);
    restore(target, owner.patches);
  };
}
