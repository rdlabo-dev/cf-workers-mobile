import { transformAsync } from "@babel/core";
import asyncFunctions from "@babel/plugin-transform-async-to-generator";
import asyncGenerators from "@babel/plugin-transform-async-generator-functions";
import { readFile } from "node:fs/promises";
import type { Plugin, Loader } from "esbuild";

/** Lower function continuations, preserving module-level await and imports. */
export async function lowerAsync(code: string, filename: string) {
  if (!/\basync\b/.test(code)) return { code, map: null };
  const path = filename.split("?")[0];
  const result = await transformAsync(code, {
    filename: path,
    configFile: false,
    babelrc: false,
    sourceType: "unambiguous",
    sourceMaps: true,
    parserOpts: {
      plugins: [
        ...(/\.[cm]?tsx?$/.test(path) ? ["typescript" as const] : []),
        ...(/\.[jt]sx$/.test(path) ? ["jsx" as const] : []),
      ],
    },
    plugins: [asyncGenerators, asyncFunctions],
  });
  return {
    code: result?.code ?? code,
    map: result?.map ? JSON.stringify(result.map) : null,
  };
}
export function asyncContextPlugin(): Plugin {
  return {
    name: "capacitor-workers-async-context",
    setup(build) {
      build.onLoad(
        { filter: /\.[cm]?[jt]sx?$/, namespace: "file" },
        async ({ path }) => {
          const result = await lowerAsync(await readFile(path, "utf8"), path);
          const extension = path.split(".").pop()!;
          const loader: Loader = /^(?:m|c)?ts$/.test(extension)
            ? "ts"
            : extension === "tsx"
              ? "tsx"
              : extension === "jsx"
                ? "jsx"
                : "js";
          return {
            contents:
              result.code +
              (result.map
                ? "\n//# sourceMappingURL=data:application/json;base64," +
                  Buffer.from(result.map).toString("base64")
                : ""),
            loader,
          };
        },
      );
    },
  };
}
