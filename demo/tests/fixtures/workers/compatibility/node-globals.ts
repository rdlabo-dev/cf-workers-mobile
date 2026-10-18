import { Buffer as ImportedBuffer } from "node:buffer";
import importedProcess from "node:process";

const scope = globalThis as typeof globalThis & {
  Buffer: typeof ImportedBuffer;
  process: typeof importedProcess;
  global: typeof globalThis;
};

export const nodeGlobals = {
  unqualified: [Buffer === ImportedBuffer, process === importedProcess],
  qualified: [
    scope.Buffer === ImportedBuffer,
    scope.process === importedProcess,
    scope.global === globalThis,
  ],
  computed: [
    scope["Buffer"] === ImportedBuffer,
    scope["process"] === importedProcess,
    scope["global"] === globalThis,
  ],
  dynamic: async () => {
    const dependency = await import("./node-globals-dynamic");
    return dependency.dynamicGlobals;
  },
  processEnv: { ...scope.process.env },
};
