// esbuild injects these imports only where a Node global is referenced.
export { process, global, setImmediate, clearImmediate } from "./runtime.js";
export { Buffer } from "node:buffer";
