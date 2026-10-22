import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const sdk = resolve(process.env.CODEC_EMSDK ?? "artifacts/toolchains/emsdk");
const source = resolve("artifacts/upstream/openssl");
const revision = (directory) =>
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: directory,
    encoding: "utf8",
  }).trim();
const revisions = { emsdk: revision(sdk), openssl: revision(source) };
assert.equal(revisions.emsdk, "e4fe26ef59168ff44f4c23c466e497bf60b3411e");
assert.equal(revisions.openssl, "45e844fa2a14ec92d146bd8f5778ac130b6625fb");
assert.equal(
  execFileSync("git", ["diff", "--name-only"], {
    cwd: source,
    encoding: "utf8",
  }).trim(),
  "",
  "OpenSSL source must match the pinned revision",
);
const compiler = join(sdk, "upstream/emscripten");
const configure = [
  "linux-generic32",
  "--cross-compile-prefix=",
  "no-asm",
  "no-shared",
  "no-threads",
  "no-tests",
  "no-dso",
  "no-module",
  "no-apps",
  "no-docs",
  "no-sock",
  "no-ui-console",
  "no-autoload-config",
  "no-engine",
  "no-afalgeng",
  "--with-rand-seed=getrandom",
  "-O3",
];
if (!process.argv.includes("--link-only")) {
  execFileSync(join(compiler, "emconfigure"), ["./Configure", ...configure], {
    cwd: source,
    stdio: "inherit",
  });
  execFileSync(join(compiler, "emmake"), ["make", "-j4", "build_libs"], {
    cwd: source,
    stdio: "inherit",
  });
}
const binding = "src/compat/crypto/native-crypto.c";
const output = "src/compat/crypto/native-crypto.wasm";
const flags = [
  "-O3",
  "-Wno-deprecated-declarations",
  "-sSTANDALONE_WASM=1",
  "-sALLOW_MEMORY_GROWTH=1",
  "-sFILESYSTEM=0",
  "-sASSERTIONS=0",
  "-sMALLOC=emmalloc",
  "-sABORTING_MALLOC=0",
  "--no-entry",
  '-sEXPORTED_FUNCTIONS=["_malloc","_free"]',
];
execFileSync(
  join(compiler, "emcc"),
  [
    binding,
    "-I" + join(source, "include"),
    join(source, "libcrypto.a"),
    ...flags,
    "-o",
    output,
  ],
  { stdio: "inherit" },
);
const sha = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
writeFileSync(
  "src/compat/crypto/native-crypto.build.json",
  JSON.stringify(
    {
      revisions,
      configure,
      flags,
      bindingSha256: sha(binding),
      sha256: sha(output),
    },
    null,
    2,
  ) + "\n",
);
