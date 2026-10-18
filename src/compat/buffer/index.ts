// Copyright (c) 2017-2022 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import {
  constants,
  kMaxLength,
  kStringMaxLength,
  Buffer,
  SlowBuffer,
  isAscii,
  isUtf8,
  transcode,
  INSPECT_MAX_BYTES,
  resolveObjectURL,
} from "./internal-buffer.js";

const atob = globalThis.atob.bind(globalThis);
const btoa = globalThis.btoa.bind(globalThis);
import { Blob, File } from "./blob.js";

export {
  atob,
  btoa,
  constants,
  kMaxLength,
  kStringMaxLength,
  Blob,
  Buffer,
  File,
  SlowBuffer,
  isAscii,
  isUtf8,
  transcode,
  INSPECT_MAX_BYTES,
  resolveObjectURL,
};

export default {
  atob,
  btoa,
  constants,
  kMaxLength,
  kStringMaxLength,
  Blob,
  Buffer,
  File,
  SlowBuffer,
  isAscii,
  isUtf8,
  transcode,
  INSPECT_MAX_BYTES,
  resolveObjectURL,
};
