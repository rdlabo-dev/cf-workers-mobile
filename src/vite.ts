import { documentAssets, listAssets } from "./build/documents.js";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import {
  configuredPath,
  compatibilityAliases,
  globalsInstallPath,
  nodeGlobalsInstallPath,
  globalsPath,
  workerEntry,
} from "./build/shared.js";
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
  const overrides = Object.fromEntries(
    Object.entries(compatibilityAliases()).filter(
      ([specifier]) => !specifier.includes(":") && !specifier.includes("/"),
    ),
  );
  return [
    ...(installGlobals
      ? [
          {
            name: "capacitor-workers-global-install",
            enforce: "pre" as const,
            transform(code: string, id: string) {
              const path = normalizePath(id.split("?")[0]);
              if (
                !/\.[cm]?[jt]sx?$/.test(path) ||
                path.includes("/node_modules/") ||
                path.startsWith(
                  normalizePath(resolve(globalsPath, "../../../")),
                )
              )
                return;
              return `import ${JSON.stringify(installGlobals === "worker" ? globalsInstallPath : nodeGlobalsInstallPath)};\n${code}`;
            },
          },
        ]
      : []),
    {
      name: "capacitor-workers",
      config: () => ({
        // Express and cloudflare:node must share one prebundled HTTP registry.
        optimizeDeps: { include: ["cloudflare:node", "node:http", "http"] },
        resolve: {
          alias: compatibilityAliases(),
        },
      }),
    },
    ...nodePolyfills({
      overrides,
      globals: { Buffer: false, global: false, process: false },
    }),
    {
      ...inject({
        Buffer: [globalsPath, "Buffer"],
        process: [globalsPath, "process"],
        global: [globalsPath, "global"],
        setImmediate: [globalsPath, "setImmediate"],
        clearImmediate: [globalsPath, "clearImmediate"],
        exclude: [
          normalizePath(globalsPath),
          normalizePath(globalsInstallPath),
        ],
      }),
      enforce: "post",
    },
  ];
}

// A real-looking absolute ID survives Vite's worker query stripping without
// writing generated entry files into the consumer's project.
const entrySuffix = ".capacitor-worker.js";
function workerEntryPlugin(entries: Map<string, string>): Plugin {
  return {
    name: "capacitor-workers-entry",
    enforce: "pre",
    resolveId(source) {
      if (entries.has(source.split("?")[0])) return source;
    },
    load(id) {
      const [path, query = ""] = id.split("?");
      if (entries.has(path) && !new URLSearchParams(query).has("worker")) {
        const original = entries.get(path)!;
        return workerEntry(original);
      }
    },
  };
}

/** Add only to the Capacitor/browser build, never the Cloudflare build. */
export interface CapacitorWorkersPluginOptions {
  /** Workers application entry, relative to Vite root or an absolute path. */
  worker?: string;
}
export function capacitorWorkersPlugin(
  options: CapacitorWorkersPluginOptions = {},
): PluginOption[] {
  const entries = new Map<string, string>();
  let root: string;
  let publicDir: string;
  return [
    {
      name: "capacitor-workers-source",
      enforce: "pre",
      config: () => ({
        optimizeDeps: { exclude: ["@rdlabo/capacitor-workers"] },
        worker: { format: "es" },
      }),
      configResolved(config) {
        root = config.root;
        publicDir = config.publicDir;
      },
      generateBundle: {
        order: "post",
        async handler(_options, bundle) {
          const files = [
            ...Object.keys(bundle),
            ...(publicDir ? await listAssets(publicDir) : []),
          ];
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
        const resolved = await this.resolve(path, undefined, {
          skipSelf: true,
        });
        if (!resolved || resolved.external)
          this.error("Cannot resolve Worker entry: " + path);
        const entry = resolved.id;
        const generated = entry + entrySuffix;
        if (existsSync(generated))
          this.error(
            "Generated Worker entry conflicts with an existing file: " +
              generated,
          );
        entries.set(generated, entry);
        return `import Constructor from ${JSON.stringify(generated + "?worker")};
import { installNodeGlobals } from ${JSON.stringify(globalsPath)};
export default { createWorker: () => new Constructor(), async loadDirect() {
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
    workerEntryPlugin(entries),
    {
      name: "capacitor-workers-worker-build",
      config(config) {
        const previous = config.worker?.plugins;
        return {
          worker: {
            plugins: () => [
              ...(previous?.() ?? []),
              workerEntryPlugin(entries),
              ...compatibilityPlugins("worker"),
            ],
          },
        };
      },
    },
    ...compatibilityPlugins(options.worker ? false : "node"),
  ];
}
