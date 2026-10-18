// Copyright (c) 2017-2022 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0
import { default as urlUtil } from "./idna.js";
import { ERR_MISSING_ARGS } from "./errors.js";
import {
  fileURLToPath,
  pathToFileURL,
  toPathIfFileURL,
  urlToHttpOptions,
} from "./internal-url.js";
import { format, parse, resolve, resolveObject, Url } from "./legacy-url.js";

import { URL, URLSearchParams } from "./web-url.js";

export function domainToASCII(domain?: unknown): string {
  if (arguments.length < 1) {
    throw new ERR_MISSING_ARGS("domain");
  }

  return urlUtil.domainToASCII(`${domain}`);
}

export function domainToUnicode(domain?: unknown): string {
  if (arguments.length < 1) {
    throw new ERR_MISSING_ARGS("domain");
  }

  return urlUtil.domainToUnicode(`${domain}`);
}

export {
  fileURLToPath,
  pathToFileURL,
  toPathIfFileURL,
  urlToHttpOptions,
} from "./internal-url.js";
export { format, parse, resolve, resolveObject, Url } from "./legacy-url.js";
export { URL, URLSearchParams };

export default {
  domainToASCII,
  domainToUnicode,
  URL,
  URLSearchParams,
  fileURLToPath,
  pathToFileURL,
  toPathIfFileURL,
  urlToHttpOptions,
  // Legacy APIs
  format,
  parse,
  resolve,
  resolveObject,
  Url,
};
