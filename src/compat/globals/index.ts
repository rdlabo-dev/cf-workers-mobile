// esbuild injects these imports only where a Node global is referenced.
import { Buffer } from "node:buffer";
import process from "node:process";

import {
  setImmediate as localSetImmediate,
  clearImmediate as localClearImmediate,
} from "../immediate/index.js";
export const setImmediate = globalThis.setImmediate ?? localSetImmediate;
export const clearImmediate = globalThis.clearImmediate ?? localClearImmediate;
export { Buffer, process };
export const global = globalThis;

const values = { Buffer, process, global, setImmediate, clearImmediate };
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

export function installNodeGlobals(target: GlobalTarget = globalThis) {
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
