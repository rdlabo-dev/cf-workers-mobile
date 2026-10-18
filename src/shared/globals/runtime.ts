// Keep non-Buffer globals independent of Buffer's own dependencies.
import process from "node:process";
import {
  setImmediate as localSetImmediate,
  clearImmediate as localClearImmediate,
} from "../../compat/immediate/index.js";
const nodeSetImmediate = globalThis.setImmediate ?? localSetImmediate;
const nodeClearImmediate = globalThis.clearImmediate ?? localClearImmediate;
const workerGlobal = globalThis;
export { process, workerGlobal as global };
export {
  nodeSetImmediate as setImmediate,
  nodeClearImmediate as clearImmediate,
};
