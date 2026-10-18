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
    "punycode/": polyfill("punycode/punycode.js"),
    "node:punycode": compatPath("punycode"),
    punycode: compatPath("punycode"),
    "node:child_process": compatPath("child-process"),
    child_process: compatPath("child-process"),
    "node:cluster": compatPath("cluster"),
    cluster: compatPath("cluster"),
    "node:dgram": compatPath("dgram"),
    dgram: compatPath("dgram"),
    "node:inspector/promises": compatPath("inspector").replace(
      /index\.js$/,
      "promises.js",
    ),
    "inspector/promises": compatPath("inspector").replace(
      /index\.js$/,
      "promises.js",
    ),
    "node:inspector": compatPath("inspector"),
    inspector: compatPath("inspector"),
    "node:readline/promises": compatPath("readline").replace(
      /index\.js$/,
      "promises.js",
    ),
    "readline/promises": compatPath("readline").replace(
      /index\.js$/,
      "promises.js",
    ),
    "node:readline": compatPath("readline"),
    readline: compatPath("readline"),
    "node:domain": compatPath("domain"),
    domain: compatPath("domain"),
    "node:https": compatPath("https"),
    https: compatPath("https"),
    "node:worker_threads": compatPath("worker-threads"),
    worker_threads: compatPath("worker-threads"),
    "node:test": compatPath("test"),
    "node:sqlite": compatPath("sqlite"),
    "node:repl": compatPath("repl"),
    repl: compatPath("repl"),
    "node:vm": compatPath("vm"),
    vm: compatPath("vm"),
    "node:http2": compatPath("http2"),
    http2: compatPath("http2"),
    "node:constants": compatPath("constants"),
    constants: compatPath("constants"),
    "node:v8": compatPath("v8"),
    v8: compatPath("v8"),
    "node:wasi": compatPath("wasi"),
    wasi: compatPath("wasi"),
    "node:os": compatPath("os"),
    os: compatPath("os"),
    "node:tty": compatPath("tty"),
    tty: compatPath("tty"),
    "node:url": compatPath("url"),
    url: compatPath("url"),
    "node:async_hooks": compatPath("async-hooks"),
    async_hooks: compatPath("async-hooks"),
    "node:timers/promises": fileURLToPath(
      new URL("../compat/timers/promises.js", import.meta.url),
    ),
    "timers/promises": fileURLToPath(
      new URL("../compat/timers/promises.js", import.meta.url),
    ),
    "node:timers": compatPath("timers"),
    timers: compatPath("timers"),
    "node:fs/promises": compatPath("fs/promises"),
    "fs/promises": compatPath("fs/promises"),
    "node:fs": compatPath("fs"),
    fs: compatPath("fs"),
    "node:module": compatPath("module"),
    module: compatPath("module"),
    "node:stream/web": compatPath("stream-web"),
    "stream/web": compatPath("stream-web"),
    // The util compat reuses the npm package through its deep specifier,
    // which must precede the bare "util" alias.
    "util/util.js": polyfill("util/util.js"),
    "node:util": compatPath("util"),
    util: compatPath("util"),
    "node:buffer": compatPath("buffer"),
    buffer: compatPath("buffer"),
    "node:_http_agent": compatPath("http-agent"),
    _http_agent: compatPath("http-agent"),
    "node:_http_client": compatPath("http-client"),
    _http_client: compatPath("http-client"),
    "node:_http_incoming": compatPath("http-incoming"),
    _http_incoming: compatPath("http-incoming"),
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
export function workerEntry(entry: string, virtualFiles?: string) {
  // WebKit can evaluate a Worker entry twice when a dynamic child imports its
  // exports. Keep the bootstrap free of exports and all shared code in children.
  const files = virtualFiles
    ? `const { registerVirtualFiles } = await import(${JSON.stringify(compatPath("fs"))});\nregisterVirtualFiles(${virtualFiles});\n`
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
  new URL("../compat/globals/inject.js", import.meta.url),
);
