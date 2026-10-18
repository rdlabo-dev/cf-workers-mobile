import { asyncContextPlugin, lowerAsync } from "./async.js";
import { documentAssets, listAssets } from "./documents.js";
import { serverModules } from "./server-modules.js";
import type { ServerBuildOptions } from "./server.js";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import type { Plugin } from "esbuild";
import {
  configuredPath,
  compatibilityAliases,
  globalsInjectPath,
  workerEntry,
  workerSource,
} from "./shared.js";

const require = createRequire(import.meta.url);
function compatibilityPlugin(): Plugin {
  return {
    name: "workers-capacitor-compatibility",
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
          ? { path, namespace: "workers-capacitor-unavailable" }
          : { path: require.resolve(aliases[path]) },
      );
      // Like Vite's browser external: importable, but no unsupported API is provided.
      build.onLoad(
        { filter: /.*/, namespace: "workers-capacitor-unavailable" },
        () => ({ contents: "module.exports = {};", loader: "js" }),
      );
      build.initialOptions.inject = [
        ...new Set([...(build.initialOptions.inject ?? []), globalsInjectPath]),
      ];
    },
  };
}
export interface WorkersCapacitorPluginOptions extends ServerBuildOptions {
  /** Workers entry relative to absWorkingDir (or cwd), or an absolute path. */
  worker: string;
  /**
   * Files embedded into the worker's read-only virtual filesystem
   * (node:fs compat). Paths resolve relative to absWorkingDir.
   */
  workerFiles?: string[];
}

/** Browser ESM builds only. Worker assets participate in the parent build. */
export function workersCapacitorPlugin(
  options: WorkersCapacitorPluginOptions,
): Plugin {
  return {
    name: "workers-capacitor",
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
          "workersCapacitorPlugin requires worker, bundle: true, format: 'esm', browser platform and outdir or outfile.",
        );
      const root = config.absWorkingDir ?? process.cwd();
      // Written builds include document assets automatically. In-memory builds
      // remain available for tooling and Fetch-only consumers.
      if (config.write !== false) {
        const outdir = resolve(root, config.outdir ?? dirname(config.outfile!));
        build.onEnd(async (result) => {
          if (result.errors.length) return;
          const compilation = await server.get();
          if (compilation) {
            const { mode, reason, routes } = compilation;
            await writeFile(
              resolve(outdir, compilation.reportFile),
              JSON.stringify({ mode, reason, routes }, null, 2),
            );
          }
          const assets = await documentAssets(
            (await listAssets(outdir)).filter(
              (file) =>
                ![
                  "workers-capacitor-assets.json",
                  "workers-capacitor-sw.js",
                ].includes(file),
            ),
          );
          for (const [file, source] of Object.entries(assets))
            await writeFile(resolve(outdir, file), source);
        });
      }
      const originalEntry = resolve(root, options.worker);
      const server = serverModules(originalEntry, root, options);
      let entry = originalEntry;
      let selector: string | undefined;
      const serverPlugin: Plugin = {
        name: "workers-capacitor-server",
        setup(build) {
          build.onResolve(
            { filter: /\.capacitor-server-(local|selector)\.js$/ },
            ({ path }) => (server.owns(path) ? { path } : undefined),
          );
          build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async ({ path }) => {
            const generated = await server.load(path);
            if (generated)
              return {
                contents: (await lowerAsync(generated.code, path, "js")).code,
                loader: "js",
                resolveDir: dirname(originalEntry),
                watchFiles: generated.inputs,
              };
            await server.guard(path);
          });
        },
      };
      build.onStart(async () => {
        server.reset();
        const compilation = await server.get();
        entry = compilation ? server.localEntry : originalEntry;
        selector = compilation ? server.selectorEntry : undefined;
        if (compilation)
          return {
            warnings: [
              {
                text:
                  compilation.mode === "worker"
                    ? `Server bindings: all requests execute on the deployed Worker (${compilation.reason}). No Worker application code is distributed to Capacitor.`
                    : `Server bindings: ${compilation.routes.filter((route) => route.remote).length} server route/middleware registrations selected before local execution.`,
              },
            ],
          };
      });
      await serverPlugin.setup(build);
      const virtualFiles = async () => {
        if (!options.workerFiles?.length) return undefined;
        const map: Record<string, { base64: string }> = {};
        for (const file of options.workerFiles)
          map[resolve(root, file)] = {
            base64: (await readFile(resolve(root, file))).toString("base64"),
          };
        return JSON.stringify(map);
      };
      await compatibilityPlugin().setup(build);
      build.onLoad({ filter: /configured\.js$/ }, ({ path }) => {
        if (path !== configuredPath) return;
        return {
          contents: workerSource(entry, "workers-capacitor:factory", selector),
          loader: "js",
          resolveDir: root,
        };
      });
      build.onResolve(
        { filter: /^workers-capacitor:(factory|asset\.js)$/ },
        ({ path }) => ({ path, namespace: "workers-capacitor" }),
      );
      build.onLoad(
        { filter: /:factory$/, namespace: "workers-capacitor" },
        () => ({
          contents: `import url from "workers-capacitor:asset.js";\nexport default () => new Worker(new URL(url, import.meta.url), { type: "module" });`,
          loader: "js",
        }),
      );
      build.onLoad(
        { filter: /:asset\.js$/, namespace: "workers-capacitor" },
        async () => {
          const result = await build.esbuild.build({
            absWorkingDir: root,
            stdin: {
              contents: workerEntry(entry, await virtualFiles()),
              resolveDir: root,
              sourcefile: "workers-capacitor-entry.js",
            },
            bundle: true,
            format: "esm",
            platform: "browser",
            write: false,
            outfile: "workers-capacitor-worker.js",
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
            plugins: [serverPlugin, compatibilityPlugin(), asyncContextPlugin()],
            logLevel: "silent",
          });
          const inputs = Object.keys(result.metafile.inputs)
            .filter((path) => path !== "workers-capacitor-entry.js")
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
      await asyncContextPlugin().setup(build);
    },
  };
}
