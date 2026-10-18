import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { compileD1Worker, d1Bindings, type D1BuildOptions } from "./d1.js";

/** Shared virtual graph for the UI and Dedicated Worker builds. */
export function d1Modules(
  entry: string,
  root: string,
  options: D1BuildOptions,
) {
  const normalize = (path: string) => path.replaceAll("\\", "/");
  const localEntry = normalize(entry) + ".capacitor-d1-local.js";
  const selectorEntry = normalize(entry) + ".capacitor-d1-selector.js";
  let pending: ReturnType<typeof prepare> | undefined;
  async function prepare() {
    let configurationRoot = root;
    if (!options.workerConfig && !options.d1Bindings) {
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
    const bindings = await d1Bindings(configurationRoot, options);
    if (!bindings.names.length) return;
    const compilation = await compileD1Worker(entry, bindings.names, {
      localBindings: options.localBindings,
    });
    return {
      ...compilation,
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
          "D1 build configuration disappeared; restart the build",
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
          `Server source ${id} was imported outside the generated Worker graph. Importing original server modules into the client would bypass D1 removal.`,
        );
    },
  };
}
