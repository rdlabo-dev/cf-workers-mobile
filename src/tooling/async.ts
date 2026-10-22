import { transformAsync } from "@babel/core";
import asyncFunctions from "@babel/plugin-transform-async-to-generator";
import asyncGenerators from "@babel/plugin-transform-async-generator-functions";
import { readFile } from "node:fs/promises";
import type { Plugin, Loader } from "esbuild";

/** Lower function continuations, preserving module-level await and imports. */
export async function lowerAsync(
  code: string,
  filename: string,
  loader?: Loader,
) {
  if (!/\basync\b/.test(code)) return { code, map: null };
  const path = filename.split("?")[0];
  const typescript = loader
    ? loader === "ts" || loader === "tsx"
    : /\.[cm]?tsx?$/.test(path);
  const jsx = loader
    ? loader === "jsx" || loader === "tsx"
    : /\.[jt]sx$/.test(path);
  const options: NonNullable<Parameters<typeof transformAsync>[1]> = {
    filename: path,
    configFile: false,
    babelrc: false,
    sourceType: "unambiguous",
    sourceMaps: true,
    parserOpts: {
      plugins: [
        // Parse decorators without transforming them: esbuild/TypeScript keeps
        // ownership of legacy vs standard decorator lowering and validation.
        "decorators",
        "decoratorAutoAccessors",
        ...(typescript ? ["typescript" as const] : []),
        ...(jsx ? ["jsx" as const] : []),
      ],
    },
    plugins: [
      () => {
        const intrinsicFunctions: Array<{ async: boolean }> = [];
        return {
          visitor: {
            Program(path) {
              // Type-only `this` parameters must not contribute to the wrapper
              // arity computed by Babel before esbuild strips TypeScript syntax.
              path.traverse({
                Function(path) {
                  const first = path.node.params[0];
                  if (first?.type === "Identifier" && first.name === "this")
                    path.node.params.shift();
                  // Empty anonymous async generators are used to discover native
                  // iterator intrinsics (including by workerd's events module).
                  // They have no continuation to instrument. Hide only this
                  // exact form from lowering, then restore its native syntax.
                  const node = path.node;
                  if (
                    node.type === "FunctionExpression" &&
                    !node.id &&
                    node.async &&
                    node.generator &&
                    node.params.length === 0 &&
                    node.body.body.length === 0 &&
                    node.body.directives.length === 0
                  ) {
                    intrinsicFunctions.push(node);
                    node.async = false;
                  }
                },
              });
            },
          },
          post() {
            for (const node of intrinsicFunctions) node.async = true;
          },
        };
      },
      asyncGenerators,
      asyncFunctions,
    ],
  };
  let result;
  try {
    result = await transformAsync(code, options);
  } catch (error) {
    // TypeScript parameter decorators require the legacy grammar, whereas
    // `export @decorator class` requires the standard grammar. Parse both;
    // esbuild still owns validation against the consumer's compiler options.
    if ((error as { code?: string }).code !== "BABEL_PARSE_ERROR") throw error;
    options.parserOpts!.plugins![0] = "decorators-legacy";
    result = await transformAsync(code, options);
  }
  return {
    code: result?.code ?? code,
    map: result?.map ? JSON.stringify(result.map) : null,
  };
}
export function asyncContextPlugin(): Plugin {
  return {
    name: "workers-capacitor-async-context",
    setup(build) {
      build.onLoad(
        { filter: /\.[cm]?[jt]sx?$/, namespace: "file" },
        async ({ path }) => {
          const extension = path.split(".").pop()!;
          const loader: Loader =
            build.initialOptions.loader?.[`.${extension}`] ??
            (/^(?:m|c)?ts$/.test(extension)
              ? "ts"
              : extension === "tsx"
                ? "tsx"
                : extension === "jsx"
                  ? "jsx"
                  : "js");
          // Respect consumer loaders (including treating .js as text/assets).
          if (!["js", "jsx", "ts", "tsx"].includes(loader)) return;
          const result = await lowerAsync(
            await readFile(path, "utf8"),
            path,
            loader,
          );
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
