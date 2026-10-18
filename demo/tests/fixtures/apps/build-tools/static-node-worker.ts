import { Buffer as ImportedBuffer } from "node:buffer";
import importedProcess from "node:process";

const scope = globalThis as typeof globalThis & {
  Buffer: typeof ImportedBuffer;
  process: typeof importedProcess;
  global: typeof globalThis;
};
const evaluated = [
  Buffer === ImportedBuffer,
  process === importedProcess,
  scope.Buffer === ImportedBuffer,
  scope["process"] === importedProcess,
  scope.global === globalThis,
];

export default {
  fetch() {
    return Response.json({ evaluated });
  },
};
