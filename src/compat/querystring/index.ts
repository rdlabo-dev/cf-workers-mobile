// node:querystring compatibility unit.
//
// Implementation is vendored from workerd 1.20261012.1
// (src/node/internal/internal_querystring.ts) in ./internal-querystring.ts.
// See LICENSE-3RD-PARTY.md for Cloudflare/Node licenses.
import {
  escape,
  parse,
  stringify,
  unescape,
  unescapeBuffer,
} from "./internal-querystring.js";

export const encode = stringify;
export const decode = parse;

export { escape, parse, stringify, unescape, unescapeBuffer };

export default {
  decode,
  encode,
  escape,
  parse,
  stringify,
  unescape,
  unescapeBuffer,
};
