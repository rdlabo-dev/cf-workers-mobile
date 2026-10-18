import { build } from "esbuild";
// The package owns its codec asset. Consumers need no WASM loader or extra URL.
await build({
  entryPoints: ["src/shared/brotli/index.ts"],
  outfile: "dist/shared/brotli/index.js",
  bundle: true,
  format: "esm",
  target: "es2022",
  loader: { ".wasm": "binary" },
});

// Web Streams must also be loadable by the raw browser-ESM entry.
await build({
  entryPoints: ["src/compat/stream-web/ponyfill.ts"],
  outfile: "dist/compat/stream-web/ponyfill.js",
  bundle: true,
  format: "esm",
  target: "es2022",
});
