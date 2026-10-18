import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
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
    if (!bindings.names.length && !bindings.forceRemoteReason) return;
    const compilation = await compileServerWorker(entry, bindings.names, {
      localBindings: options.localBindings,
      forceRemoteReason: bindings.forceRemoteReason,
    });
    return {
      ...compilation,
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
        code: id === localEntry ? result.local : result.selector,
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
