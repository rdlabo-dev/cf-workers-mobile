import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const root = "artifacts/upstream/web-streams-polyfill";
const revision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
assert.equal(revision, "12b4fedec6c01503a137d837204ca0b85992461e");
const changes = {};
await build({
  entryPoints: [root + "/src/ponyfill.ts"],
  outfile: "src/compat/stream-web/workers-ponyfill.js",
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  keepNames: true,
  define: { DEBUG: "false" },
  banner: {
    js: "// Generated from web-streams-polyfill 4.3.0 (MIT), with pinned Workers cancellation semantics.\n// Rebuild using scripts/build-workers-streams.mjs; see LICENSE.",
  },
  plugins: [
    {
      name: "workers-stream-behavior",
      setup(build) {
        build.onLoad(
          { filter: /readable-stream\/(tee|pipe)\.ts$/ },
          async ({ path }) => {
            let source = await readFile(path, "utf8");
            if (path.endsWith("/tee.ts")) {
              const pattern =
                "const compositeReason = CreateArrayFromList([reason1, reason2]);";
              assert.equal(source.split(pattern).length - 1, 4);
              source = source.replaceAll(
                pattern,
                "const compositeReason = reason;",
              );
            } else {
              const replace = (from, to) => {
                assert.equal(source.split(from).length - 1, 1, from);
                source = source.replace(from, to);
              };
              replace(
                "actions.map(action => action())",
                "actions.reverse().map(action => action())",
              );
              replace(
                "shutdownWithAction(() => Promise.all(actions.reverse().map(action => action())), true, error);",
                "shutdownWithAction(() => Promise.all(actions.reverse().map(action => action())), true, error, true);",
              );
              replace(
                "const request = new PipeReadRequest(state);\n      ReadableStreamDefaultReaderRead(reader, request);",
                "const request = new PipeReadRequest(state);\n      state._currentRead = request._promise;\n      ReadableStreamDefaultReaderRead(reader, request);",
              );
              replace(
                "originalError?: any) {",
                "originalError?: any, waitForRead = false) {",
              );
              replace(
                "if (dest._state === 'writable' && !WritableStreamCloseQueuedOrInFlight(dest)) {\n        uponFulfillment(state._waitForWritesToFinish(), doTheRest);\n      } else {\n        doTheRest();\n      }",
                "const read = waitForRead ? state._currentRead : undefined;\n      uponFulfillment(read ? PerformPromiseThen(read, noop, noop) : promiseResolvedWith(undefined), () => {\n        if (dest._state === 'writable' && !WritableStreamCloseQueuedOrInFlight(dest)) uponFulfillment(state._waitForWritesToFinish(), doTheRest);\n        else doTheRest();\n      });",
              );
              replace(
                "class PipeState<T> {\n  _shuttingDown = false;",
                "class PipeState<T> {\n  _shuttingDown = false;\n  _currentRead: Promise<boolean> | undefined;",
              );
              // Two read request classes share this prefix; patch only PipeReadRequest.
              assert.equal(
                source.split(
                  "_chunkSteps(chunk: T) {\n    this._state._currentWrite",
                ).length - 1,
                2,
              );
              source = source.replace(
                "_chunkSteps(chunk: T) {\n    this._state._currentWrite",
                "_chunkSteps(chunk: T) {\n    if (this._state._shuttingDown) {this._resolvePromise(false); return;}\n    this._state._currentWrite",
              );
            }
            changes[path.endsWith("/tee.ts") ? "tee" : "pipe"] = createHash(
              "sha256",
            )
              .update(source)
              .digest("hex");
            return { contents: source, loader: "ts" };
          },
        );
      },
    },
  ],
});
await writeFile(
  "src/compat/stream-web/workers-ponyfill.build.json",
  JSON.stringify(
    {
      revision,
      changes,
      sha256: createHash("sha256")
        .update(await readFile("src/compat/stream-web/workers-ponyfill.js"))
        .digest("hex"),
    },
    null,
    2,
  ) + "\n",
);
