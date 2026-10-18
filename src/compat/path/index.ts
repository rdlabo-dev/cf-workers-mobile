// node:path compatibility unit.
//
// Implementation is vendored from workerd 1.20261012.1
// (src/node/internal/internal_path.ts) in ./internal-path.ts, preserving
// Workers semantics: the virtual process cwd is '/', win32 is fully
// implemented, and matchesGlob reproduces Workers' not-implemented
// rejection. See LICENSE-3RD-PARTY.md for Cloudflare/Node licenses.
import { posix, win32 } from "./internal-path.js";

const {
  resolve,
  normalize,
  isAbsolute,
  join,
  relative,
  toNamespacedPath,
  dirname,
  basename,
  extname,
  format,
  parse,
  sep,
  delimiter,
  matchesGlob,
} = posix;

export {
  resolve,
  normalize,
  isAbsolute,
  join,
  relative,
  toNamespacedPath,
  dirname,
  basename,
  extname,
  format,
  parse,
  sep,
  delimiter,
  posix,
  win32,
  matchesGlob,
};

export { default } from "./internal-path.js";
