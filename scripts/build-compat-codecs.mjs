import { build } from "esbuild";
// The package owns its codec asset. Consumers need no WASM loader or extra URL.
await build({
  entryPoints: ["src/compat/brotli/index.ts"],
  outfile: "dist/compat/brotli/index.js",
  bundle: true,
  format: "esm",
  target: "es2022",
  loader: { ".wasm": "binary" },
});
