// Keep non-Buffer globals independent of Buffer's own dependencies.
import {
  setImmediate as localSetImmediate,
  clearImmediate as localClearImmediate,
} from "../../compat/immediate/index.js";
const nodeSetImmediate = globalThis.setImmediate ?? localSetImmediate;
const nodeClearImmediate = globalThis.clearImmediate ?? localClearImmediate;
const workerGlobal = globalThis;
export { workerGlobal as global };
export {
  nodeSetImmediate as setImmediate,
  nodeClearImmediate as clearImmediate,
};
