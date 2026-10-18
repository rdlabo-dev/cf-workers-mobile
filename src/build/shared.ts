import stdlib from "node-stdlib-browser";
import { fileURLToPath } from "node:url";

export const configuredPath = fileURLToPath(
  new URL("../configured.js", import.meta.url),
);
export const transportPath = fileURLToPath(
  new URL("../isolated/transport.js", import.meta.url),
);
export const globalsPath = fileURLToPath(
  new URL("../shared/globals/index.js", import.meta.url),
);
export const networkRelayPath = fileURLToPath(
  new URL("../browser/fetch/relay.js", import.meta.url),
);
export const globalsInstallPath = fileURLToPath(
  new URL("../shared/globals/install.js", import.meta.url),
);
export const nodeGlobalsInstallPath = fileURLToPath(
  new URL("../shared/globals/node-install.js", import.meta.url),
);
export const nodeCompatPath = (name: string) =>
  fileURLToPath(new URL(`../compat/${name}/index.js`, import.meta.url));
const workersModulePath = (name: string) =>
  fileURLToPath(new URL(`../workers/${name}/index.js`, import.meta.url));
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
    "cloudflare:node": workersModulePath("cloudflare-node"),
    "cloudflare:workers": workersModulePath("cloudflare-workers"),
    "node:async_hooks": nodeCompatPath("async-hooks"),
    async_hooks: nodeCompatPath("async-hooks"),
    "node:timers/promises": fileURLToPath(
      new URL("../compat/timers/promises.js", import.meta.url),
    ),
    "timers/promises": fileURLToPath(
      new URL("../compat/timers/promises.js", import.meta.url),
    ),
    "node:timers": nodeCompatPath("timers"),
    timers: nodeCompatPath("timers"),
    "node:fs/promises": nodeCompatPath("fs/promises"),
    "fs/promises": nodeCompatPath("fs/promises"),
    "node:fs": nodeCompatPath("fs"),
    fs: nodeCompatPath("fs"),
    "node:module": nodeCompatPath("module"),
    module: nodeCompatPath("module"),
    "node:stream/web": nodeCompatPath("stream-web"),
    "stream/web": nodeCompatPath("stream-web"),
    // The util compat reuses the npm package through its deep specifier,
    // which must precede the bare "util" alias.
    "util/util.js": polyfill("util/util.js"),
    "node:util": nodeCompatPath("util"),
    util: nodeCompatPath("util"),
    "node:buffer": nodeCompatPath("buffer"),
    buffer: nodeCompatPath("buffer"),
    "node:http": nodeCompatPath("http"),
    http: nodeCompatPath("http"),
    "node:net": nodeCompatPath("net"),
    net: nodeCompatPath("net"),
    "node:stream": polyfill("readable-stream/lib/ours/browser.js"),
    stream: polyfill("readable-stream/lib/ours/browser.js"),
    // Subpath aliases must precede their parents: object-form alias entries
    // also match an "<alias>/" prefix.
    "node:path/win32": nodeCompatPath("path/win32"),
    "path/win32": nodeCompatPath("path/win32"),
    "node:path/posix": nodeCompatPath("path/posix"),
    "path/posix": nodeCompatPath("path/posix"),
    "node:path": nodeCompatPath("path"),
    path: nodeCompatPath("path"),
    "node:querystring": nodeCompatPath("querystring"),
    querystring: nodeCompatPath("querystring"),
    "string_decoder/lib/string_decoder.js": polyfill(
      "string_decoder/lib/string_decoder.js",
    ),
    "node:string_decoder": nodeCompatPath("string-decoder"),
    string_decoder: nodeCompatPath("string-decoder"),
  };
}
export function workerEntry(entry: string, virtualFiles?: string) {
  // WebKit can evaluate a Worker entry twice when a dynamic child imports its
  // exports. Keep the bootstrap free of exports and all shared code in children.
  const files = virtualFiles
    ? `const { registerVirtualFiles } = await import(${JSON.stringify(nodeCompatPath("fs"))});\nregisterVirtualFiles(${virtualFiles});\n`
    : "";
  return `const { initializeWorkerNetwork } = await import(${JSON.stringify(networkRelayPath)});\nawait initializeWorkerNetwork();\nawait import(${JSON.stringify(globalsInstallPath)});\n${files}const { default: worker } = await import(${JSON.stringify(entry)});\nconst { serve } = await import(${JSON.stringify(transportPath)});\nserve(worker);`;
}
export function workerSource(
  entry: string,
  factoryImport: string,
  selector?: string,
) {
  return `import createWorker from ${JSON.stringify(factoryImport)};\n${selector ? `import { needsRemote } from ${JSON.stringify(selector)};` : ""}\nimport { installNodeGlobals } from ${JSON.stringify(globalsPath)};\nexport default { createWorker, ${selector ? "needsRemote," : ""} async loadDirect() {\n  const dispose = installNodeGlobals();\n  try {\n    return { handler: (await import(${JSON.stringify(entry)})).default, dispose };\n  } catch (error) {\n    dispose();\n    throw error;\n  }\n} };`;
}

export const globalsInjectPath = fileURLToPath(
  new URL("../shared/globals/inject.js", import.meta.url),
);
