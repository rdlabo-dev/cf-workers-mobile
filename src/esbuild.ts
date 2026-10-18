import { documentAssets, listAssets } from "./build/documents.js";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import type { Plugin } from "esbuild";
import {
  configuredPath,
  compatibilityAliases,
  globalsPath,
  workerEntry,
  workerSource,
} from "./build/shared.js";

const require = createRequire(import.meta.url);
function compatibilityPlugin(): Plugin {
  return {
    name: "capacitor-workers-compatibility",
    setup(build) {
      const aliases: Record<string, string> = {
        ...require("node-stdlib-browser"),
        ...compatibilityAliases(),
      };
      const filter = new RegExp(
        `^(?:${Object.keys(aliases)
          .map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join("|")})$`,
      );
      const empty = require("node-stdlib-browser").fs;
      build.onResolve({ filter }, ({ path }) =>
        aliases[path] === empty
          ? { path, namespace: "capacitor-workers-unavailable" }
          : { path: require.resolve(aliases[path]) },
      );
      // Like Vite's browser external: importable, but no unsupported API is provided.
      build.onLoad(
        { filter: /.*/, namespace: "capacitor-workers-unavailable" },
        () => ({ contents: "module.exports = {};", loader: "js" }),
      );
      build.initialOptions.inject = [
        ...new Set([...(build.initialOptions.inject ?? []), globalsPath]),
      ];
    },
  };
}
export interface CapacitorWorkersPluginOptions {
  /** Workers entry relative to absWorkingDir (or cwd), or an absolute path. */
  worker: string;
}

/** Browser ESM builds only. Worker assets participate in the parent build. */
export function capacitorWorkersPlugin(
  options: CapacitorWorkersPluginOptions,
): Plugin {
  return {
    name: "capacitor-workers",
    async setup(build) {
      const config = build.initialOptions;
      if (
        !options.worker ||
        !config.bundle ||
        config.format !== "esm" ||
        (config.platform && config.platform !== "browser") ||
        (!config.outdir && !config.outfile)
      )
        throw new Error(
          "capacitorWorkersPlugin requires worker, bundle: true, format: 'esm', browser platform and outdir or outfile.",
        );
      const root = config.absWorkingDir ?? process.cwd();
      // Written builds include document assets automatically. In-memory builds
      // remain available for tooling and Fetch-only consumers.
      if (config.write !== false) {
        const outdir = resolve(root, config.outdir ?? dirname(config.outfile!));
        build.onEnd(async (result) => {
          if (result.errors.length) return;
          const assets = await documentAssets(
            (await listAssets(outdir)).filter(
              (file) =>
                ![
                  "capacitor-workers-assets.json",
                  "capacitor-workers-sw.js",
                ].includes(file),
            ),
          );
          for (const [file, source] of Object.entries(assets))
            await writeFile(resolve(outdir, file), source);
        });
      }
      const entry = resolve(root, options.worker);
      await compatibilityPlugin().setup(build);
      build.onLoad({ filter: /configured\.js$/ }, ({ path }) => {
        if (path !== configuredPath) return;
        return {
          contents: workerSource(entry, "capacitor-workers:factory"),
          loader: "js",
          resolveDir: root,
        };
      });
      build.onResolve(
        { filter: /^capacitor-workers:(factory|asset\.js)$/ },
        ({ path }) => ({ path, namespace: "capacitor-workers" }),
      );
      build.onLoad(
        { filter: /:factory$/, namespace: "capacitor-workers" },
        () => ({
          contents: `import url from "capacitor-workers:asset.js";\nexport default () => new Worker(new URL(url, import.meta.url), { type: "module" });`,
          loader: "js",
        }),
      );
      build.onLoad(
        { filter: /:asset\.js$/, namespace: "capacitor-workers" },
        async () => {
          const result = await build.esbuild.build({
            absWorkingDir: root,
            stdin: {
              contents: workerEntry(entry),
              resolveDir: root,
              sourcefile: "capacitor-worker-entry.js",
            },
            bundle: true,
            format: "esm",
            platform: "browser",
            write: false,
            outfile: "capacitor-worker.js",
            metafile: true,
            target: config.target ?? "es2022",
            minify: config.minify,
            sourcemap: config.sourcemap ? "inline" : false,
            define: config.define,
            alias: config.alias,
            tsconfig: config.tsconfig,
            tsconfigRaw: config.tsconfigRaw,
            resolveExtensions: config.resolveExtensions,
            conditions: config.conditions,
            mainFields: config.mainFields,
            loader: config.loader,
            plugins: [compatibilityPlugin()],
            logLevel: "silent",
          });
          const inputs = Object.keys(result.metafile.inputs)
            .filter((path) => path !== "capacitor-worker-entry.js")
            .map((path) => resolve(root, path));
          if (result.outputFiles.length !== 1)
            throw new Error(
              "Worker builds must produce a single JavaScript bundle; external CSS and file assets are not supported.",
            );
          return {
            contents: result.outputFiles[0].contents,
            loader: "file",
            watchFiles: [
              ...inputs,
              ...(config.tsconfig ? [resolve(root, config.tsconfig)] : []),
            ],
            watchDirs: [...new Set(inputs.map(dirname))],
            warnings: result.warnings,
          };
        },
      );
    },
  };
}
