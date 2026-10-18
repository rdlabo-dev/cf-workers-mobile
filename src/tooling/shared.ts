import stdlib from "node-stdlib-browser";
import { fileURLToPath } from "node:url";

export const configuredPath = fileURLToPath(
  new URL("../configured.js", import.meta.url),
);
export const transportPath = fileURLToPath(
  new URL("../browser/isolated/transport.js", import.meta.url),
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
  fileURLToPath(new URL(`../cloudflare/apis/${name}/index.js`, import.meta.url));
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
    "punycode/": polyfill("punycode/punycode.js"),
    "node:punycode": nodeCompatPath("punycode"),
    punycode: nodeCompatPath("punycode"),
    "node:child_process": nodeCompatPath("child-process"),
    child_process: nodeCompatPath("child-process"),
    "node:cluster": nodeCompatPath("cluster"),
    cluster: nodeCompatPath("cluster"),
    "node:dgram": nodeCompatPath("dgram"),
    dgram: nodeCompatPath("dgram"),
    "node:inspector/promises": nodeCompatPath("inspector").replace(
      /index\.js$/,
      "promises.js",
    ),
    "inspector/promises": nodeCompatPath("inspector").replace(
      /index\.js$/,
      "promises.js",
    ),
    "node:inspector": nodeCompatPath("inspector"),
    inspector: nodeCompatPath("inspector"),
    "node:readline/promises": nodeCompatPath("readline").replace(
      /index\.js$/,
      "promises.js",
    ),
    "readline/promises": nodeCompatPath("readline").replace(
      /index\.js$/,
      "promises.js",
    ),
    "node:readline": nodeCompatPath("readline"),
    readline: nodeCompatPath("readline"),
    "node:domain": nodeCompatPath("domain"),
    domain: nodeCompatPath("domain"),
    "node:stream/promises": nodeCompatPath("stream-promises"),
    "stream/promises": nodeCompatPath("stream-promises"),
    "node:stream/consumers": nodeCompatPath("stream-consumers"),
    "stream/consumers": nodeCompatPath("stream-consumers"),
    "node:dns/promises": nodeCompatPath("dns").replace(
      "index.js",
      "promises.js",
    ),
    "dns/promises": nodeCompatPath("dns").replace("index.js", "promises.js"),
    "node:dns": nodeCompatPath("dns"),
    dns: nodeCompatPath("dns"),
    "node:assert/strict": nodeCompatPath("assert").replace(
      "index.js",
      "index.cjs",
    ),
    "assert/strict": nodeCompatPath("assert").replace("index.js", "index.cjs"),
    "node:assert": nodeCompatPath("assert").replace("index.js", "index.cjs"),
    assert: nodeCompatPath("assert").replace("index.js", "index.cjs"),
    "node:perf_hooks": nodeCompatPath("perf-hooks"),
    perf_hooks: nodeCompatPath("perf-hooks"),
    "node:trace_events": nodeCompatPath("trace-events"),
    trace_events: nodeCompatPath("trace-events"),
    "node:https": nodeCompatPath("https"),
    https: nodeCompatPath("https"),
    "node:worker_threads": nodeCompatPath("worker-threads"),
    worker_threads: nodeCompatPath("worker-threads"),
    "node:test": nodeCompatPath("test"),
    "node:sqlite": nodeCompatPath("sqlite"),
    "node:repl": nodeCompatPath("repl"),
    repl: nodeCompatPath("repl"),
    "node:vm": nodeCompatPath("vm"),
    vm: nodeCompatPath("vm"),
    "node:http2": nodeCompatPath("http2"),
    http2: nodeCompatPath("http2"),
    "node:constants": nodeCompatPath("constants"),
    constants: nodeCompatPath("constants"),
    "node:v8": nodeCompatPath("v8"),
    v8: nodeCompatPath("v8"),
    "node:wasi": nodeCompatPath("wasi"),
    wasi: nodeCompatPath("wasi"),
    "node:os": nodeCompatPath("os"),
    os: nodeCompatPath("os"),
    "node:tty": nodeCompatPath("tty"),
    tty: nodeCompatPath("tty"),
    "node:url": nodeCompatPath("url"),
    url: nodeCompatPath("url"),
    "node:diagnostics_channel": nodeCompatPath("diagnostics-channel"),
    diagnostics_channel: nodeCompatPath("diagnostics-channel"),
    "node:_tls_common": nodeCompatPath("tls-common"),
    _tls_common: nodeCompatPath("tls-common"),
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
    "node:_stream_readable": nodeCompatPath("stream-readable"),
    _stream_readable: nodeCompatPath("stream-readable"),
    "node:_stream_writable": nodeCompatPath("stream-writable"),
    _stream_writable: nodeCompatPath("stream-writable"),
    "node:_stream_duplex": nodeCompatPath("stream-duplex"),
    _stream_duplex: nodeCompatPath("stream-duplex"),
    "node:_stream_transform": nodeCompatPath("stream-transform"),
    _stream_transform: nodeCompatPath("stream-transform"),
    "node:_stream_passthrough": nodeCompatPath("stream-passthrough"),
    _stream_passthrough: nodeCompatPath("stream-passthrough"),
    "node:stream/web": nodeCompatPath("stream-web"),
    "stream/web": nodeCompatPath("stream-web"),
    // The util compat reuses the npm package through its deep specifier,
    // which must precede the bare "util" alias.
    "util/util.js": polyfill("util/util.js"),
    "node:util": nodeCompatPath("util"),
    util: nodeCompatPath("util"),
    "node:buffer": nodeCompatPath("buffer"),
    buffer: nodeCompatPath("buffer"),
    "node:_http_agent": nodeCompatPath("http-agent"),
    _http_agent: nodeCompatPath("http-agent"),
    "node:_http_client": nodeCompatPath("http-client"),
    _http_client: nodeCompatPath("http-client"),
    "node:_http_incoming": nodeCompatPath("http-incoming"),
    _http_incoming: nodeCompatPath("http-incoming"),
    "node:http": nodeCompatPath("http"),
    http: nodeCompatPath("http"),
    "node:net": nodeCompatPath("net"),
    net: nodeCompatPath("net"),
    "node:stream": nodeCompatPath("stream"),
    stream: nodeCompatPath("stream"),
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

/** CommonJS builtins return their default value; ESM keeps named helpers intact. */
export function commonJSCompatibilityAliases(): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const [name, directory] of [
    ["stream", "stream"],
    ["_stream_readable", "stream-readable"],
    ["_stream_writable", "stream-writable"],
    ["_stream_duplex", "stream-duplex"],
    ["_stream_transform", "stream-transform"],
    ["_stream_passthrough", "stream-passthrough"],
  ]) {
    const path = nodeCompatPath(directory!).replace("index.js", "index.cjs");
    entries[name!] = path;
    entries[`node:${name}`] = path;
  }
  return entries;
}
