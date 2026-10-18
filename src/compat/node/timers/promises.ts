export * from "./internal-promises.js";
import {
  setTimeout,
  setImmediate,
  setInterval,
  scheduler,
} from "./internal-promises.js";
export default { setTimeout, setImmediate, setInterval, scheduler };
