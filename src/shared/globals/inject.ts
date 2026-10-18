// esbuild injects these imports only where a Node global is referenced.
// Initialize process before Buffer: its util dependency reads process during evaluation.
import process from "node:process";
import { Buffer } from "node:buffer";

import {
  setImmediate as localSetImmediate,
  clearImmediate as localClearImmediate,
} from "../../compat/immediate/index.js";
const nodeSetImmediate = globalThis.setImmediate ?? localSetImmediate;
const nodeClearImmediate = globalThis.clearImmediate ?? localClearImmediate;
export { Buffer, process };
const workerGlobal = globalThis;
export { workerGlobal as global };

export {
  nodeSetImmediate as setImmediate,
  nodeClearImmediate as clearImmediate,
};
