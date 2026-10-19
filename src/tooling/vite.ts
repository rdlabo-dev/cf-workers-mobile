import { readWorkerFiles } from "./files.js";
import { lowerAsync, asyncContextPlugin } from "./async.js";
import { documentAssets, listAssets } from "./documents.js";
import { serverModules } from "./server-modules.js";
import type { ServerBuildOptions } from "./server.js";
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import {
  configuredPath,
  compatibilityAliases,
  compatibilityDependencies,
  commonJSCompatibilityAliases,
  globalsInstallPath,
  nodeGlobalsInstallPath,
  globalsPath,
  globalsInjectPath,
  workerEntry,
} from "./shared.js";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import inject from "@rollup/plugin-inject";
import type { Plugin, PluginOption } from "vite";
import { normalizePath } from "vite";

/** Add only to the Capacitor/browser build, never the Cloudflare build. */
function compatibilityPlugins(
  installGlobals: false | "worker" | "node" = false,
): PluginOption[] {
  // Overrides take bare module names only; both bare and "node:" imports of
  // the same module resolve to the shared compat profile.
  const globalsRuntimePath = globalsInjectPath.replace(
    /inject\.js$/,
    "runtime.js",
  );
  const aliases = compatibilityAliases();
  const commonJS = commonJSCompatibilityAliases();
  const commonJSPaths = new Map(
    Object.entries(commonJS).map(([specifier, path]) => [
      normalizePath(aliases[specifier as keyof typeof aliases]!),
      path,
    ]),
  );
  const overrides = Object.fromEntries(
    Object.entries(aliases).filter(([specifier]) => !specifier.includes(":")),
  );
  return [
    {
      name: "workers-capacitor-async-context",
      enforce: "post",
      transform(code, id) {
        if (/\.[cm]?[jt]sx?(?:\?|$)/.test(id)) return lowerAsync(code, id);
      },
      renderChunk(code, chunk) {
        return lowerAsync(code, chunk.fileName);
      },
    },
    ...(installGlobals
      ? [
          {
            name: "workers-capacitor-global-install",
            enforce: "pre" as const,
            transform(code: string, id: string) {
              // CommonJS proxy modules are already generated ESM. Injecting a
              // require into their virtual .cjs IDs leaves it unbundled.
              if (id.startsWith("\0")) return;
              const path = normalizePath(id.split("?")[0]);
              if (
                !/\.[cm]?[jt]sx?$/.test(path) ||
                path.includes("/node_modules/") ||
                path.startsWith(
                  normalizePath(resolve(globalsPath, "../../../")),
                )
              )
                return;
              const installation = JSON.stringify(
                installGlobals === "worker"
                  ? globalsInstallPath
                  : nodeGlobalsInstallPath,
              );
              return /\.c[jt]s$/.test(path)
                ? `require(${installation});\n${code}`
                : `import ${installation};\n${code}`;
            },
          },
        ]
      : []),
    {
      name: "workers-capacitor",
      enforce: "pre",
      async resolveId(source, importer, options) {
        if (options.custom?.["node-resolve"]?.isRequire)
          return commonJS[source] ?? commonJSPaths.get(normalizePath(source));
        if (!importer || !source.startsWith(".")) return;
        const root = normalizePath(resolve(globalsPath, "../../.."));
        const owner = normalizePath(importer.split("?")[0]);
        if (!owner.startsWith(`${root}/`)) return;
        const target = normalizePath(resolve(dirname(owner), source));
        // Runtime-relative imports and public builtins must resolve to the same
        // optimized module. Keep internal buffer/performance imports untouched.
        let specifier: string | undefined;
        if (target === `${root}/compat/stream-web/index.js`)
          specifier = "node:stream/web";
        else if (
          owner === `${root}/browser/body/stream-body.js` ||
          owner === `${root}/shared/globals/web.js`
        ) {
          if (target === `${root}/compat/buffer/blob.js`)
            specifier = "node:buffer";
          if (target === `${root}/compat/perf-hooks/performance.js`)
            specifier = "node:perf_hooks";
        }
        if (specifier)
          return this.resolve(specifier, importer, { skipSelf: true });
      },
      config: () => ({
        // Generated Workers (including OpenNext) can mix ESM exports with
        // require() calls in .mjs files outside node_modules.
        build: {
          commonjsOptions: {
            include: [/node_modules/, /\.[cm]?js$/],
            extensions: [".js", ".cjs", ".mjs"],
            transformMixedEsModules: true,
          },
        },
        // App globals and dependencies must share Buffer identity and the HTTP registry.
        optimizeDeps: {
          esbuildOptions: {
            plugins: [
              asyncContextPlugin(),
              {
                name: "workers-capacitor-commonjs-builtins",
                setup(build) {
                  build.onResolve(
                    {
                      filter: /^(?:node:)?[\w/]+$/,
                    },
                    ({ path, kind }) =>
                      kind === "require-call" && commonJS[path]
                        ? { path: commonJS[path] }
                        : undefined,
                  );
                },
              },
            ],
          },
          include: compatibilityDependencies(),
        },
        resolve: {
          alias: aliases,
        },
      }),
    },
    ...nodePolyfills({
      overrides,
      globals: { Buffer: false, global: false, process: false },
    }),
    {
      ...inject({
        Buffer: [globalsInjectPath, "Buffer"],
        // util reads process during Buffer initialization. Keep this import
        // independent of the injector that also imports Buffer.
        process: [aliases["process/"], "default"],
        global: [globalsRuntimePath, "global"],
        setImmediate: [globalsRuntimePath, "setImmediate"],
        clearImmediate: [globalsRuntimePath, "clearImmediate"],
        exclude: [
          normalizePath(globalsPath),
          normalizePath(globalsInjectPath),
          normalizePath(globalsRuntimePath),
          normalizePath(globalsInstallPath),
        ],
      }),
      enforce: "post",
    },
  ];
}

// A real-looking absolute ID survives Vite's worker query stripping without
// writing generated entry files into the consumer's project.
const entrySuffix = ".workers-capacitor-worker.js";
function virtualId(
  source: string,
  root: string,
  owns: (path: string) => boolean,
) {
  const [path, ...query] = source.split("?");
  const candidates = [path];
  if (path.startsWith("/@fs/"))
    candidates.push(
      /^[a-z]:/i.test(path.slice(5)) ? path.slice(5) : "/" + path.slice(5),
    );
  if (root && path.startsWith("/"))
    candidates.push(normalizePath(resolve(root, "." + path)));
  const match = candidates.find(owns);
  return match
    ? match + (query.length ? "?" + query.join("?") : "")
    : undefined;
}
function workerEntryPlugin(
  entries: Map<string, string>,
  root: () => string,
  virtualFiles?: () => Promise<string | undefined>,
): Plugin {
  return {
    name: "workers-capacitor-entry",
    enforce: "pre",
    resolveId(source) {
      return virtualId(source, root(), (path) => entries.has(path));
    },
    load(id) {
      const [path, query = ""] = id.split("?");
      if (entries.has(path) && !new URLSearchParams(query).has("worker")) {
        const original = entries.get(path)!;
        if (!virtualFiles) return workerEntry(original);
        return virtualFiles().then((files) => workerEntry(original, files));
      }
    },
  };
}

/** Add only to the Capacitor/browser build, never the Cloudflare build. */
export interface WorkersCapacitorPluginOptions extends ServerBuildOptions {
  /** Workers application entry, relative to Vite root or an absolute path. */
  worker?: string;
  /**
   * Additional files embedded into the worker's read-only virtual filesystem.
   * OpenNext manifests and package metadata are collected automatically for
   * a local generated worker.js entry. Application data files remain explicit.
   * Paths resolve relative to the Vite root; the
   * normalized absolute path is the lookup key, with suffix matching so
   * bundled runtimes find entries regardless of their cwd assumptions.
   */
  workerFiles?: string[];
}
export function workersCapacitorPlugin(
  options: WorkersCapacitorPluginOptions = {},
): PluginOption[] {
  const entries = new Map<string, string>();
  const virtualFiles = async () =>
    readWorkerFiles(
      options.worker && !(await server?.get())
        ? resolve(root, options.worker)
        : undefined,
      root,
      options.workerFiles,
    );
  let root: string;
  let publicDir: string;
  let server: ReturnType<typeof serverModules> | undefined;
  const serverPlugin = (): Plugin => ({
    name: "workers-capacitor-server",
    enforce: "pre",
    resolveId(id) {
      return virtualId(id, root, (path) => server?.owns(path) ?? false);
    },
    async load(id) {
      if (!server) return;
      const path = id.split("?")[0];
      const generated = await server.load(path);
      if (generated) {
        for (const input of generated.inputs) this.addWatchFile(input);
        return { code: generated.code, map: null };
      }
      await server.guard(path);
    },
    async handleHotUpdate(ctx) {
      const previous = await server?.get();
      if (previous?.inputs.includes(ctx.file)) {
        server?.reset();
        ctx.server.moduleGraph.invalidateAll();
        ctx.server.ws.send({ type: "full-reload" });
        return [];
      }
    },
  });
  return [
    serverPlugin(),
    {
      name: "workers-capacitor-source",
      enforce: "pre",
      config: () => ({
        optimizeDeps: { exclude: ["workers-capacitor"] },
        worker: { format: "es" },
      }),
      configResolved(config) {
        root = config.root;
        publicDir = config.publicDir;
        if (options.worker)
          server = serverModules(resolve(root, options.worker), root, options);
      },
      generateBundle: {
        order: "post",
        async handler(_options, bundle) {
          const files = [
            ...Object.keys(bundle),
            ...(publicDir ? await listAssets(publicDir) : []),
          ];
          const compilation = await server?.get();
          if (compilation) {
            const fileName = compilation.reportFile;
            if (files.includes(fileName))
              this.error("Server report asset collision: " + fileName);
            const { mode, reason, routes } = compilation;
            this.emitFile({
              type: "asset",
              fileName,
              source: JSON.stringify({ mode, reason, routes }, null, 2),
            });
            files.push(fileName);
          }
          const assets = await documentAssets(files);
          for (const [fileName, source] of Object.entries(assets)) {
            if (files.includes(fileName))
              this.error("Document asset collision: " + fileName);
            this.emitFile({ type: "asset", fileName, source });
          }
        },
      },
      async load(id) {
        if (
          id.split("?")[0] !== normalizePath(configuredPath) ||
          !options.worker
        )
          return;
        const path = resolve(root, options.worker);
        const compilation = await server?.get();
        // Resolve only the selected graph: CommonJS resolution may eagerly load
        // its target, and server source must never enter the client graph.
        const resolved = await this.resolve(
          compilation ? server!.localEntry : path,
          undefined,
          {
            skipSelf: true,
          },
        );
        if (!resolved || resolved.external)
          this.error("Cannot resolve Worker entry: " + path);
        if (compilation)
          this.warn(
            options.execution === "local"
              ? "Local execution: the entire Worker source and its retained fixed data are distributed to the device."
              : compilation.mode === "worker"
                ? `Server bindings: requests not served by bundled assets execute on the deployed Worker (${compilation.reason}). No server Worker code is distributed to Capacitor.`
                : `Server bindings: ${compilation.routes.filter((route) => route.remote).length} server route/middleware registrations selected before local execution.`,
          );
        const entry = resolved.id;
        const generated = entry + entrySuffix;
        if (existsSync(generated))
          this.error(
            "Generated Worker entry conflicts with an existing file: " +
              generated,
          );
        entries.set(generated, entry);
        return `import Constructor from ${JSON.stringify(generated + "?worker")};
${compilation ? `import { needsRemote, requiresRemote } from ${JSON.stringify(server!.selectorEntry)};` : ""}
import { installNodeGlobals } from ${JSON.stringify(globalsPath)};
export default { createWorker: () => new Constructor(), ${compilation ? "needsRemote, requiresRemote," : ""} async loadDirect() {
  const dispose = installNodeGlobals();
  try {
    return { handler: (await import(${JSON.stringify(entry)})).default, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
} };`;
      },
    },
    workerEntryPlugin(entries, () => root, virtualFiles),
    {
      name: "workers-capacitor-worker-build",
      config(config) {
        const previous = config.worker?.plugins;
        return {
          worker: {
            plugins: () => [
              ...(previous?.() ?? []),
              serverPlugin(),
              workerEntryPlugin(entries, () => root, virtualFiles),
              ...compatibilityPlugins("worker"),
            ],
          },
        };
      },
    },
    ...compatibilityPlugins(options.worker ? false : "node"),
  ];
}
