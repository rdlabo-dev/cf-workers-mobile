// node:path/posix and path/posix resolve here.
import { posix, win32 } from "../internal-path.js";

const {
  basename,
  dirname,
  extname,
  format,
  isAbsolute,
  join,
  matchesGlob,
  normalize,
  parse,
  relative,
  resolve,
  toNamespacedPath,
  delimiter,
  sep,
} = posix;
export {
  basename,
  dirname,
  extname,
  format,
  isAbsolute,
  join,
  matchesGlob,
  normalize,
  parse,
  relative,
  resolve,
  toNamespacedPath,
  delimiter,
  posix,
  sep,
  win32,
};
export default posix;
