# Third-party licenses

The URL module, internal-url.ts, legacy-url.ts, constants.ts and errors.ts
adapt cloudflare/workerd v1.20261012.1 src/node sources, including Node.js code.

## Cloudflare workerd (Apache-2.0)

Copyright (c) 2026 Cloudflare, Inc.

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

## Ada URL parser and Unicode data

`unicode.ts` ports the IDNA mapping, label validation, ASCII and Unicode
conversion from `ada-url` 4.0.0 `deps/ada.cpp`, the dependency pinned by
workerd v1.20261012.1. `idna-data.ts` contains its mapping, combining-mark,
Bidi and ContextJ tables. The source archive is pinned by SHA-256 in
`scripts/url-idna/generate.mjs`; that maintainer-only generator uses C++20 to
extract the tables without changing the runtime/build requirements.

Ada is Copyright 2023 Yagiz Nizipli and Daniel Lemire, used under its MIT
license reproduced in LICENSE-ADA. Unicode data is covered by
LICENSE-UNICODE. The pinned source's tables are the compatibility authority;
they intentionally preserve its ContextJ early returns and Bidi assignments.
NFC normalization uses the Web standard String.prototype.normalize.

Punycode encoding and decoding use the separately packaged `punycode` 2.3.1
(MIT), whose license is included in that dependency.

## WHATWG URL implementation (MIT)

`standard-url.ts` is generated from `whatwg-url` 17.3.0 using
`scripts/url-idna/bundle-url.mjs` and the root lockfile. Its license is reproduced
in LICENSE-WHATWG-URL. The generator substitutes the pinned Workers IDNA module,
the Web-standard USVString conversion and the UTF-8 encoding required by the
public URL APIs. It excludes unused legacy HTML encoding tables and guards the
upstream WebIDL utility's SharedArrayBuffer introspection when unavailable.
Only URL construction/parsing is exposed through the facade; URLSearchParams
retains its native brand and native URL query owner for BodyInit interoperability.
