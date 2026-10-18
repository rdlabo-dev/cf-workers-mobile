import { documentAssets, listAssets } from "./build/documents.js";
import { d1Modules } from "./build/d1-modules.js";
import type { D1BuildOptions } from "./build/d1.js";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  configuredPath,
  compatibilityAliases,
  globalsInstallPath,
  nodeGlobalsInstallPath,
  globalsPath,
  globalsInjectPath,
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
  const globalsRuntimePath = globalsInjectPath.replace(
    /inject\.js$/,
    "runtime.js",
  );
  const aliases = compatibilityAliases();
  const overrides = Object.fromEntries(
    Object.entries(aliases).filter(([specifier]) => !specifier.includes(":")),
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
      enforce: "pre",
      transform(code, id) {
        if (
          normalizePath(id.split("?")[0]) !==
          normalizePath(resolve(globalsPath, "../web.js"))
        )
          return;
        // Vite's prebundled node:buffer and runtime globals must share Blob/File.
        // Keep the distributed runtime's relative import usable as raw browser ESM.
        return code.replace('from "../buffer/blob.js"', 'from "node:buffer"');
      },
      config: () => ({
        // App globals and dependencies must share Buffer identity and the HTTP registry.
        optimizeDeps: {
          include: [
            "cloudflare:node",
            "node:_http_agent",
            "_http_agent",
            "node:_http_client",
            "_http_client",
            "node:_http_incoming",
            "_http_incoming",
            "node:stream/consumers",
            "stream/consumers",
            "node:https",
            "https",
            "node:http",
            "http",
            "node:buffer",
            "buffer",
            "node:punycode",
            "punycode",
            "node:constants",
            "constants",
            "node:v8",
            "v8",
            "node:http2",
            "http2",
            "node:child_process",
            "child_process",
            "node:cluster",
            "cluster",
            "node:dgram",
            "dgram",
            "node:inspector/promises",
            "inspector/promises",
            "node:inspector",
            "inspector",
            "node:readline/promises",
            "readline/promises",
            "node:readline",
            "readline",
            "node:domain",
            "domain",
            "node:worker_threads",
            "worker_threads",
            "node:test",
            "node:sqlite",
            "node:repl",
            "repl",
            "node:vm",
            "vm",
            "node:wasi",
            "wasi",
            "node:os",
            "os",
            "node:net",
            "net",
            "node:tty",
            "tty",
            "node:url",
            "url",
            "node:timers",
            "timers",
            "node:timers/promises",
            "timers/promises",
          ],
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
const entrySuffix = ".capacitor-worker.js";
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
  virtualFiles?: () => Promise<string>,
): Plugin {
  return {
    name: "capacitor-workers-entry",
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
export interface CapacitorWorkersPluginOptions extends D1BuildOptions {
  /** Workers application entry, relative to Vite root or an absolute path. */
  worker?: string;
  /**
   * Files embedded into the worker's read-only virtual filesystem
   * (node:fs compat). Paths resolve relative to the Vite root; the
   * normalized absolute path is the lookup key, with suffix matching so
   * bundled runtimes find entries regardless of their cwd assumptions.
   */
  workerFiles?: string[];
}
export function capacitorWorkersPlugin(
  options: CapacitorWorkersPluginOptions = {},
): PluginOption[] {
  const entries = new Map<string, string>();
  const virtualFiles = options.workerFiles?.length
    ? async () => {
        const map: Record<string, { base64: string }> = {};
        for (const file of options.workerFiles!) {
          const path = resolve(root, file);
          map[normalizePath(path)] = {
            base64: (await readFile(path)).toString("base64"),
          };
        }
        return JSON.stringify(map);
      }
    : undefined;
  let root: string;
  let publicDir: string;
  let d1: ReturnType<typeof d1Modules> | undefined;
  const d1Plugin = (): Plugin => ({
    name: "capacitor-workers-d1",
    enforce: "pre",
    resolveId(id) {
      return virtualId(id, root, (path) => d1?.owns(path) ?? false);
    },
    async load(id) {
      if (!d1) return;
      const path = id.split("?")[0];
      const generated = await d1.load(path);
      if (generated) {
        for (const input of generated.inputs) this.addWatchFile(input);
        return { code: generated.code, map: null };
      }
      await d1.guard(path);
    },
    async handleHotUpdate(ctx) {
      const previous = await d1?.get();
      if (previous?.inputs.includes(ctx.file)) {
        d1?.reset();
        ctx.server.moduleGraph.invalidateAll();
        ctx.server.ws.send({ type: "full-reload" });
        return [];
      }
    },
  });
  return [
    d1Plugin(),
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
        if (options.worker)
          d1 = d1Modules(resolve(root, options.worker), root, options);
      },
      generateBundle: {
        order: "post",
        async handler(_options, bundle) {
          const files = [
            ...Object.keys(bundle),
            ...(publicDir ? await listAssets(publicDir) : []),
          ];
          const compilation = await d1?.get();
          if (compilation) {
            const fileName = "capacitor-workers-d1.json";
            if (files.includes(fileName))
              this.error("D1 report asset collision: " + fileName);
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
        const resolved = await this.resolve(path, undefined, {
          skipSelf: true,
        });
        if (!resolved || resolved.external)
          this.error("Cannot resolve Worker entry: " + path);
        const compilation = await d1?.get();
        if (compilation)
          this.warn(
            compilation.mode === "worker"
              ? `D1: all requests execute on the deployed Worker (${compilation.reason}). No Worker application code is distributed to Capacitor.`
              : `D1: ${compilation.routes.filter((route) => route.remote).length} server route/middleware registrations selected before local execution.`,
          );
        const entry = compilation ? d1!.localEntry : resolved.id;
        const generated = entry + entrySuffix;
        if (existsSync(generated))
          this.error(
            "Generated Worker entry conflicts with an existing file: " +
              generated,
          );
        entries.set(generated, entry);
        return `import Constructor from ${JSON.stringify(generated + "?worker")};
${compilation ? `import { needsRemote } from ${JSON.stringify(d1!.selectorEntry)};` : ""}
import { installNodeGlobals } from ${JSON.stringify(globalsPath)};
export default { createWorker: () => new Constructor(), ${compilation ? "needsRemote," : ""} async loadDirect() {
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
      name: "capacitor-workers-worker-build",
      config(config) {
        const previous = config.worker?.plugins;
        return {
          worker: {
            plugins: () => [
              ...(previous?.() ?? []),
              d1Plugin(),
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
