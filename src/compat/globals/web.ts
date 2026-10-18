import { installAbortTimeout } from "../abort/index.js";
import { installResourceSymbols } from "./symbols.js";
import { Request } from "../request/index.js";
import { Response } from "../response/index.js";
import { Headers } from "../headers/index.js";
import { structuredClone } from "../structured-clone/index.js";

const values = { Request, Response, Headers, structuredClone };
type Name = keyof typeof values;
type Target = Record<string, unknown>;
type Patch = {
  previous: PropertyDescriptor | undefined;
  installed: PropertyDescriptor;
};
const installations = new WeakMap<
  Target,
  {
    owners: number;
    abortSignal: unknown;
    patches: Map<Name, Patch>;
    restoreSymbols: () => void;
    restoreAbort: () => void;
  }
>();
function owns(target: Target, name: Name, expected: PropertyDescriptor) {
  const actual = Object.getOwnPropertyDescriptor(target, name);
  return (
    actual?.value === expected.value &&
    actual?.writable === expected.writable &&
    actual?.enumerable === expected.enumerable &&
    actual?.configurable === expected.configurable
  );
}
function restore(target: Target, patches: Map<Name, Patch>) {
  for (const [name, { previous, installed }] of patches) {
    if (!owns(target, name, installed)) continue;
    if (previous) Object.defineProperty(target, name, previous);
    else delete target[name];
  }
}
/** Own only these replacements; preserve exact descriptors and later app changes. */
export function installWebGlobals(target: Target = globalThis) {
  let installation = installations.get(target);
  if (installation) {
    if (target.AbortSignal !== installation.abortSignal)
      throw new Error(
        "Workers AbortSignal constructor changed during installation",
      );
    for (const [name, patch] of installation.patches)
      if (!owns(target, name, patch.installed))
        throw new Error(`Workers global ${name} changed during installation`);
    installAbortTimeout(target.AbortSignal as typeof AbortSignal | undefined)();
    installation.owners++;
  } else {
    const patches = new Map<Name, Patch>();
    let restoreSymbols = () => {};
    let restoreAbort = () => {};
    try {
      for (const name of Object.keys(values) as Name[]) {
        const previous = Object.getOwnPropertyDescriptor(target, name);
        if (previous?.value === values[name]) continue;
        const installed = {
          configurable: true,
          enumerable: previous?.enumerable ?? false,
          writable: true,
          value: values[name],
        };
        Object.defineProperty(target, name, installed);
        patches.set(name, { previous, installed });
      }
      restoreAbort = installAbortTimeout(
        target.AbortSignal as typeof AbortSignal | undefined,
      );
      restoreSymbols = installResourceSymbols(
        target.Symbol as SymbolConstructor | undefined,
      );
    } catch (error) {
      restoreAbort();
      restore(target, patches);
      throw error;
    }
    installation = {
      owners: 1,
      abortSignal: target.AbortSignal,
      patches,
      restoreSymbols,
      restoreAbort,
    };
    installations.set(target, installation);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--installation.owners) return;
    installations.delete(target);
    restore(target, installation.patches);
    installation.restoreSymbols();
    installation.restoreAbort();
  };
}
