// Copyright (c) 2017-2022 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0
// Copyright Joyent and Node contributors. All rights reserved. MIT license.

import { METHODS as methods } from "../http/index.js";
import { kIncomingMessage } from "../http/symbols.js";
export { methods, kIncomingMessage };
const tokenRegExp = /^[\^_`a-zA-Z\-0-9!#$%&'*+.|~]+$/;
/**
 * Verifies that the given val is a valid HTTP token
 * per the rules defined in RFC 7230
 * See https://tools.ietf.org/html/rfc7230#section-3.2.6
 */
export function _checkIsHttpToken(val: string): boolean {
  return tokenRegExp.test(val);
}

const headerCharRegex = /[^\t\x20-\x7e\x80-\xff]/;
/**
 * True if val contains an invalid field-vchar
 *  field-value    = *( field-content / obs-fold )
 *  field-content  = field-vchar [ 1*( SP / HTAB ) field-vchar ]
 *  field-vchar    = VCHAR / obs-text
 */
export function _checkInvalidHeaderChar(
  val: number | string | ReadonlyArray<string>,
): boolean {
  if (Array.isArray(val)) {
    return val.some((v: string) => headerCharRegex.test(v));
  }
  return headerCharRegex.test(`${val}`);
}

export const CRLF = "\r\n";
export const chunkExpression = /(?:^|\W)chunked(?:$|\W)/i;
export const continueExpression = /(?:^|\W)100-continue(?:$|\W)/i;
export const parsers = { name: "parsers", max: 1000 };
export default {
  _checkIsHttpToken,
  _checkInvalidHeaderChar,
  chunkExpression,
  kIncomingMessage,
  CRLF,
  continueExpression,
  methods,
  parsers,
};
