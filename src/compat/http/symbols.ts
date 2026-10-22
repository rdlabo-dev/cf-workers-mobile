// Copyright (c) 2017-2022 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0
// Copyright Joyent and Node contributors. All rights reserved. MIT license.

export const kIncomingMessage = Symbol("IncomingMessage");
export const kServerResponse = Symbol("ServerResponse");
export const kUniqueHeaders = Symbol("kUniqueHeaders");
export const kHighWaterMark = Symbol("kHighWaterMark");
export const kConnectionsCheckingInterval = Symbol(
  "http.server.connectionsCheckingInterval",
);
