import stdlib from "node-stdlib-browser";
import { fileURLToPath } from "node:url";

export const configuredPath = fileURLToPath(
  new URL("../configured.js", import.meta.url),
);
export const transportPath = fileURLToPath(
  new URL("../isolated/transport.js", import.meta.url),
);
export const globalsPath = fileURLToPath(
  new URL("../compat/globals/index.js", import.meta.url),
);
export const networkRelayPath = fileURLToPath(
  new URL("../compat/fetch/relay.js", import.meta.url),
);
export const globalsInstallPath = fileURLToPath(
  new URL("../compat/globals/install.js", import.meta.url),
);
export const nodeGlobalsInstallPath = fileURLToPath(
  new URL("../compat/globals/node-install.js", import.meta.url),
);
export const compatPath = (name: string) =>
  fileURLToPath(new URL(`../compat/${name}/index.js`, import.meta.url));
// A compat module reusing a CommonJS polyfill imports the concrete package
// file; the bare name is the alias target, so only the deep specifier can
// reach the real implementation without recursing.
const polyfill = (specifier: string) =>
  fileURLToPath(import.meta.resolve(specifier));
export function compatibilityAliases() {
  return {
    // readable-stream uses this trailing-slash package import. Resolve it
    // before Vite converts the process prefix into a directory path.
    "process/": stdlib.process,
    "cloudflare:node": compatPath("cloudflare-node"),
    "cloudflare:workers": compatPath("cloudflare-workers"),
    "node:async_hooks": compatPath("async-hooks"),
    async_hooks: compatPath("async-hooks"),
    "node:http": compatPath("http"),
    http: compatPath("http"),
    "node:net": compatPath("net"),
    net: compatPath("net"),
    "node:stream": polyfill("readable-stream/lib/ours/browser.js"),
    stream: polyfill("readable-stream/lib/ours/browser.js"),
    // Subpath aliases must precede their parents: object-form alias entries
    // also match an "<alias>/" prefix.
    "node:path/win32": compatPath("path/win32"),
    "path/win32": compatPath("path/win32"),
    "node:path/posix": compatPath("path/posix"),
    "path/posix": compatPath("path/posix"),
    "node:path": compatPath("path"),
    path: compatPath("path"),
    "node:querystring": compatPath("querystring"),
    querystring: compatPath("querystring"),
    "string_decoder/lib/string_decoder.js": polyfill(
      "string_decoder/lib/string_decoder.js",
    ),
    "node:string_decoder": compatPath("string-decoder"),
    string_decoder: compatPath("string-decoder"),
  };
}
export function workerEntry(entry: string) {
  // WebKit can evaluate a Worker entry twice when a dynamic child imports its
  // exports. Keep the bootstrap free of exports and all shared code in children.
  return `const { initializeWorkerNetwork } = await import(${JSON.stringify(networkRelayPath)});\nawait initializeWorkerNetwork();\nawait import(${JSON.stringify(globalsInstallPath)});\nconst { default: worker } = await import(${JSON.stringify(entry)});\nconst { serve } = await import(${JSON.stringify(transportPath)});\nserve(worker);`;
}
export function workerSource(entry: string, factoryImport: string) {
  return `import createWorker from ${JSON.stringify(factoryImport)};\nimport { installNodeGlobals } from ${JSON.stringify(globalsPath)};\nexport default { createWorker, async loadDirect() {\n  const dispose = installNodeGlobals();\n  try {\n    return { handler: (await import(${JSON.stringify(entry)})).default, dispose };\n  } catch (error) {\n    dispose();\n    throw error;\n  }\n} };`;
}
