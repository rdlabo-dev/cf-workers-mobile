// esbuild injects these imports only where a Node global is referenced.
export { global, setImmediate, clearImmediate } from "./runtime.js";
export { default as process } from "node:process";
export { Buffer } from "node:buffer";
