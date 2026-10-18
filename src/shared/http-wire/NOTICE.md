# llhttp WebAssembly

`wasm.ts` embeds the non-SIMD llhttp binary distributed in `undici@7.29.1`,
`lib/llhttp/llhttp-wasm.js`, without changes to its bytes. It runs in the WebView
or Dedicated Worker, not a native plugin. The surrounding adapter is local code.

Binary size: 54,013 bytes. SHA-256:
`57184a16144b5bc880e29105fa35d75c93dd318563e1b743e110de845e2ab661`.

Sources: https://github.com/nodejs/undici/tree/v7.29.1/deps/llhttp
Build instructions: https://github.com/nodejs/undici/blob/v7.29.1/CONTRIBUTING.md

Upstream licenses are included in LICENSE.llhttp and LICENSE.undici.
The non-SIMD binary avoids a platform-specific SIMD selection path.
