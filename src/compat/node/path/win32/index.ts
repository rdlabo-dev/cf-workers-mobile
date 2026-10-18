// node:path/win32 and path/win32 resolve here.
import { win32, posix } from "../internal-path.js";

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
} = win32;
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
export default win32;
