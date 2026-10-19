import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { compileOpenNext } from "./opennext/index.js";
import { compileVoid } from "./void/index.js";
import {
  compileServerWorker,
  serverBindings,
  type ServerBuildOptions,
} from "./server.js";

/** Shared virtual graph for the UI and Dedicated Worker builds. */
export function serverModules(
  entry: string,
  root: string,
  options: ServerBuildOptions,
) {
  const normalize = (path: string) => path.replaceAll("\\", "/");
  const localEntry = normalize(entry) + ".capacitor-server-local.js";
  const selectorEntry = normalize(entry) + ".capacitor-server-selector.js";
  let pending: ReturnType<typeof prepare> | undefined;
  async function prepare() {
    let configurationRoot = root;
    if (!options.workerConfig) {
      for (let directory = dirname(entry); ; directory = dirname(directory)) {
        if (
          ["wrangler.jsonc", "wrangler.json", "wrangler.toml"].some((name) =>
            existsSync(resolve(directory, name)),
          )
        ) {
          configurationRoot = directory;
          break;
        }
        if (
          existsSync(resolve(directory, "package.json")) ||
          directory === dirname(directory)
        )
          break;
      }
    }
    const bindings = await serverBindings(configurationRoot, options);

    const framework =
      Array.isArray(options.execution) &&
      (!bindings.forceRemoteReason ||
        bindings.forceRemoteReason ===
          "Asset-first routing executes on the deployed Worker")
        ? ((await compileOpenNext(entry, options.execution, bindings.names)) ??
          (await compileVoid(entry, options.execution, bindings.names)))
        : undefined;
    const compilation =
      framework ??
      (await compileServerWorker(entry, bindings.names, {
        execution: options.execution,
        localBindings: bindings.localBindings,
        kvBindings: bindings.kvBindings,
        forceRemoteReason: bindings.forceRemoteReason,
      }));
    const localCount = compilation.routes.filter(
      (route) => !route.remote && route.method !== "use",
    ).length;
    const remoteCount = compilation.routes.filter(
      (route) => route.remote,
    ).length;
    const message =
      options.execution === "local"
        ? "Local execution: the entire Worker source and its retained fixed data are distributed to the device."
        : Array.isArray(options.execution) &&
            options.execution.length > 0 &&
            localCount === 0
          ? `No selected routes can execute locally. Requests will use the deployed Worker. See ${bindings.reportFile} for reasons.`
          : compilation.mode === "worker"
            ? `Network execution: requests not served by bundled assets execute on the deployed Worker (${compilation.reason}). No server Worker code is distributed to Capacitor.`
            : `Execution selection: ${localCount} local handlers, ${remoteCount} remote route/middleware registrations. See ${bindings.reportFile} for reasons.`;
    return {
      ...compilation,
      requiresRemote:
        Array.isArray(options.execution) ||
        compilation.routes.some((route) => route.remote),
      message,
      reportFile: bindings.reportFile,
      inputs: [
        ...compilation.inputs,
        ...(bindings.config ? [bindings.config] : []),
      ].map(normalize),
    };
  }
  const get = () => (pending ??= prepare());
  return {
    localEntry,
    selectorEntry,
    get,
    reset() {
      pending = undefined;
    },
    owns(id: string) {
      return id === localEntry || id === selectorEntry;
    },
    async load(id: string) {
      if (!this.owns(id)) return;
      const result = await get();
      if (!result)
        throw new Error(
          "Server build configuration disappeared; restart the build",
        );
      return {
        code:
          id === localEntry
            ? result.local
            : result.selector +
              `\nexport const requiresRemote = ${result.requiresRemote};`,
        inputs: result.inputs,
      };
    },
    async guard(id: string) {
      if (id.startsWith("\0")) return;
      const result = await get();
      if (result?.inputs.includes(normalize(resolve(id))))
        throw new Error(
          `Server source ${id} was imported outside the generated Worker graph. Importing original server modules into the client would bypass server code removal.`,
        );
    },
  };
}
