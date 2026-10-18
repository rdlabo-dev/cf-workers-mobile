// @ts-nocheck
// Copyright (c) 2017-2022 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0
//

import { pipeline } from "./pipeline.js";
import { addAbortSignal } from "./add-abort-signal.js";
import { eos } from "./end-of-stream.js";
import {
  isErrored,
  isDisturbed,
  isDestroyed,
  isReadable,
  isWritable,
} from "./util.js";
import { destroyer } from "./destroy.js";
import { getDefaultHighWaterMark, setDefaultHighWaterMark } from "./state.js";
import { compose } from "./compose.js";
import { Stream } from "./legacy.js";
import { Writable } from "./writable.js";
import { Readable } from "./readable.js";
import { Duplex, duplexPair } from "./duplex.js";
import { Transform, PassThrough } from "./transform.js";
import { promises } from "./promises.js";

// eslint-disable-next-line @typescript-eslint/unbound-method
export const _isArrayBufferView = Stream._isArrayBufferView;
// eslint-disable-next-line @typescript-eslint/unbound-method
export const _isUint8Array = Stream._isUint8Array;
// eslint-disable-next-line @typescript-eslint/unbound-method
export const _uint8ArrayToBuffer = Stream._uint8ArrayToBuffer;
const destroy = destroyer;
const finished = eos;

export {
  addAbortSignal,
  compose,
  destroy,
  finished,
  isErrored,
  isDisturbed,
  isReadable,
  pipeline,
  Stream,
  Writable,
  Readable,
  Duplex,
  Transform,
  PassThrough,
  promises,
  getDefaultHighWaterMark,
  setDefaultHighWaterMark,
  isDestroyed,
  isWritable,
  duplexPair,
};

// @ts-expect-error TS2322 Type incompatibility between internal and Node.js stream types
Stream.addAbortSignal = addAbortSignal;
Stream.compose = compose;
Stream.destroy = destroy;
// @ts-expect-error TS2741 __promisify__ is missing.
Stream.finished = finished;
Stream.isReadable = isReadable;
// @ts-expect-error TS2322 Type incompatibility between internal and Node.js stream types
Stream.isWritable = isWritable;
Stream.isErrored = isErrored;
Stream.isDisturbed = isDisturbed;
Stream.pipeline = pipeline;
Stream.Stream = Stream;
// @ts-expect-error TS2419 Type incompatibility due to exactOptionalPropertyTypes
Stream.Writable = Writable;
// @ts-expect-error TS2419 Type incompatibility due to exactOptionalPropertyTypes
Stream.Readable = Readable;
Stream.Duplex = Duplex;
// @ts-expect-error TS2419 Type incompatibility due to exactOptionalPropertyTypes
Stream.Transform = Transform;
Stream.PassThrough = PassThrough;
// @ts-expect-error TS2322 Type incompatibility due to exactOptionalPropertyTypes
Stream.promises = promises;
Stream.getDefaultHighWaterMark = getDefaultHighWaterMark;
Stream.setDefaultHighWaterMark = setDefaultHighWaterMark;
Stream.isDestroyed = isDestroyed;
Stream.duplexPair = duplexPair;

export default Stream;
