import {
  Buffer,
  process,
  global,
  setImmediate as nodeSetImmediate,
  clearImmediate as nodeClearImmediate,
} from "./inject.js";
export {
  Buffer,
  process,
  global,
  setImmediate,
  clearImmediate,
} from "./inject.js";
import { installTimerGlobals } from "../../node/timers/installation.js";

const values = {
  Buffer,
  process,
  global,
  setImmediate: nodeSetImmediate,
  clearImmediate: nodeClearImmediate,
};
type NodeGlobal = keyof typeof values;
type GlobalTarget = typeof globalThis & Record<string, unknown>;
type Installation = {
  owners: number;
  installed: Map<NodeGlobal, PropertyDescriptor>;
};
const installations = new WeakMap<GlobalTarget, Installation>();

function owns(
  target: GlobalTarget,
  name: NodeGlobal,
  descriptor: PropertyDescriptor,
) {
  const current = Object.getOwnPropertyDescriptor(target, name);
  return (
    current !== undefined &&
    current.configurable === descriptor.configurable &&
    current.enumerable === descriptor.enumerable &&
    current.writable === descriptor.writable &&
    current.value === descriptor.value
  );
}

function removeInstalled(target: GlobalTarget, installation: Installation) {
  for (const [name, descriptor] of installation.installed)
    if (owns(target, name, descriptor)) delete target[name];
}

function installNodeNames(target: GlobalTarget) {
  let installation = installations.get(target);
  if (installation) {
    for (const name of Object.keys(values) as NodeGlobal[])
      if (target[name] !== values[name])
        throw new Error(
          `Cannot install Node global ${name}: existing value is incompatible.`,
        );
    installation.owners++;
  } else {
    installation = { owners: 1, installed: new Map() };
    for (const name of Object.keys(values) as NodeGlobal[])
      if (name in target && target[name] !== values[name])
        throw new Error(
          `Cannot install Node global ${name}: existing value is incompatible.`,
        );
    try {
      for (const name of Object.keys(values) as NodeGlobal[]) {
        if (name in target) continue;
        const descriptor: PropertyDescriptor = {
          configurable: true,
          enumerable: true,
          writable: true,
          value: values[name],
        };
        Object.defineProperty(target, name, descriptor);
        installation.installed.set(name, descriptor);
      }
    } catch (error) {
      removeInstalled(target, installation);
      throw error;
    }
    installations.set(target, installation);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--installation.owners) return;
    installations.delete(target);
    removeInstalled(target, installation);
  };
}

export function installNodeGlobals(target: GlobalTarget = globalThis) {
  const restoreTimers = installTimerGlobals(target);
  try {
    const restoreNames = installNodeNames(target);
    return () => {
      restoreNames();
      restoreTimers();
    };
  } catch (error) {
    restoreTimers();
    throw error;
  }
}
