// Copyright (c) 2017-2022 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0
// Copyright Joyent and Node contributors. All rights reserved. MIT license.

import {
  Server,
  ServerResponse,
  IncomingMessage,
  STATUS_CODES,
  _connectionListener,
} from "../http/index.js";
import {
  kIncomingMessage,
  kServerResponse,
  kConnectionsCheckingInterval,
} from "../http/symbols.js";
import { validateInteger } from "../crypto/validation.js";
import { validateBoolean } from "../net/validators.js";
import { ERR_OUT_OF_RANGE } from "../net/errors.js";
class ERR_OPTION_NOT_IMPLEMENTED extends Error {
  code = "ERR_OPTION_NOT_IMPLEMENTED";
  constructor(option: string) {
    super(`The ${option} option is not implemented`);
  }
}
export {
  Server,
  ServerResponse,
  STATUS_CODES,
  kServerResponse,
  kConnectionsCheckingInterval,
  _connectionListener,
};
export function setupConnectionsTracking(): never {
  throw Object.assign(
    new Error("The setupConnectionsTracking method is not implemented"),
    { code: "ERR_METHOD_NOT_IMPLEMENTED" },
  );
}
export function storeHTTPOptions(this: any, options: any): void {
  this[kIncomingMessage] = options.IncomingMessage || IncomingMessage;
  this[kServerResponse] = options.ServerResponse || ServerResponse;

  const maxHeaderSize = options.maxHeaderSize;
  if (maxHeaderSize !== undefined) {
    validateInteger(maxHeaderSize, "maxHeaderSize", 0);
    throw new ERR_OPTION_NOT_IMPLEMENTED("maxHeaderSize");
  }

  const insecureHTTPParser = options.insecureHTTPParser;
  if (insecureHTTPParser !== undefined) {
    // If enabled it will use a HTTP parser with leniency flags enabled.
    // Since our implementation does not use any http parser, and uses "fetch" API,
    // it doesn't make sense to support this option.
    validateBoolean(insecureHTTPParser, "options.insecureHTTPParser");
  }

  const requestTimeout = options.requestTimeout;
  if (requestTimeout !== undefined) {
    validateInteger(requestTimeout, "requestTimeout", 0);
    this.requestTimeout = requestTimeout;
  } else {
    this.requestTimeout = 300_000; // 5 minutes
  }

  const headersTimeout = options.headersTimeout;
  if (headersTimeout !== undefined) {
    validateInteger(headersTimeout, "headersTimeout", 0);
    this.headersTimeout = headersTimeout;
  } else {
    this.headersTimeout = Math.min(60_000, this.requestTimeout); // Minimum between 60 seconds or requestTimeout
  }

  if (
    this.requestTimeout > 0 &&
    this.headersTimeout > 0 &&
    this.headersTimeout > this.requestTimeout
  ) {
    throw new ERR_OUT_OF_RANGE(
      "headersTimeout",
      "<= requestTimeout",
      headersTimeout,
    );
  }

  const keepAliveTimeout = options.keepAliveTimeout;
  if (keepAliveTimeout !== undefined) {
    validateInteger(keepAliveTimeout, "keepAliveTimeout", 0);
    throw new ERR_OPTION_NOT_IMPLEMENTED("keepAliveTimeout");
  }

  const keepAliveTimeoutBuffer = options.keepAliveTimeoutBuffer;
  if (keepAliveTimeoutBuffer !== undefined) {
    validateInteger(keepAliveTimeoutBuffer, "keepAliveTimeoutBuffer");
    throw new ERR_OPTION_NOT_IMPLEMENTED("keepAliveTimeoutBuffer");
  }

  const connectionsCheckingInterval = options.connectionsCheckingInterval;
  if (connectionsCheckingInterval !== undefined) {
    validateInteger(
      connectionsCheckingInterval,
      "connectionsCheckingInterval",
      0,
    );
    throw new ERR_OPTION_NOT_IMPLEMENTED("connectionsCheckingInterval");
  }

  const requireHostHeader = options.requireHostHeader;
  if (requireHostHeader !== undefined) {
    validateBoolean(requireHostHeader, "options.requireHostHeader");
    this.requireHostHeader = requireHostHeader;
  } else {
    this.requireHostHeader = true;
  }

  const joinDuplicateHeaders = options.joinDuplicateHeaders;
  if (joinDuplicateHeaders !== undefined) {
    validateBoolean(joinDuplicateHeaders, "options.joinDuplicateHeaders");
  }
  this.joinDuplicateHeaders = joinDuplicateHeaders ?? false;

  const rejectNonStandardBodyWrites = options.rejectNonStandardBodyWrites;
  if (rejectNonStandardBodyWrites !== undefined) {
    validateBoolean(
      rejectNonStandardBodyWrites,
      "options.rejectNonStandardBodyWrites",
    );
    this.rejectNonStandardBodyWrites = rejectNonStandardBodyWrites;
  } else {
    this.rejectNonStandardBodyWrites = false;
  }
}

export function httpServerPreClose(server: any) {
  server.closeIdleConnections();
  clearInterval(server[kConnectionsCheckingInterval]);
}
export default {
  Server,
  ServerResponse,
  STATUS_CODES,
  kServerResponse,
  kConnectionsCheckingInterval,
  _connectionListener,
  setupConnectionsTracking,
  storeHTTPOptions,
  httpServerPreClose,
};
