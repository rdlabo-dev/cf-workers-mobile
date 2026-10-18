# Third-party licenses

The decoder shell in `index.ts` reproduces the interface semantics of
workerd `v1.20261012.1` (`src/node/internal/internal_stringdecoder.ts`),
which is adapted from Node.js `lib/string_decoder.js`. UTF-8 decoding uses a local state machine and the standard TextDecoder.
Other encodings delegate to the `string_decoder` npm package (MIT, Joyent/Node),
with adapters for Workers state semantics. That package is the extracted
Node.js implementation and ships its own license.

## Cloudflare workerd (Apache-2.0)

Copyright (c) 2017-2022 Cloudflare, Inc.

Licensed under the Apache License, Version 2.0 (the "License").
The full license text is reproduced in LICENSE-APACHE in this directory.

## Node.js (MIT)

Copyright Joyent, Inc. and other Node contributors. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.
