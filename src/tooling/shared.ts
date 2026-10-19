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
  fileURLToPath(
    new URL(`../cloudflare/apis/${name}/index.js`, import.meta.url),
  );
// A compat module reusing a CommonJS polyfill imports the concrete package
// file; the bare name is the alias target, so only the deep specifier can
// reach the real implementation without recursing.
const polyfill = (specifier: string) =>
  fileURLToPath(import.meta.resolve(specifier));
// One entry per builtin; subpaths precede parent aliases when expanded.
// The optional third path is the CommonJS constructor entry.
const builtins: readonly (readonly [string, string, string?])[] = [
  ["punycode", "punycode/index.js"],
  ["child_process", "child-process/index.js"],
  ["cluster", "cluster/index.js"],
  ["dgram", "dgram/index.js"],
  ["inspector/promises", "inspector/promises.js"],
  ["inspector", "inspector/index.js"],
  ["readline/promises", "readline/promises.js"],
  ["readline", "readline/index.js"],
  ["domain", "domain/index.js"],
  ["stream/promises", "stream-promises/index.js"],
  ["stream/consumers", "stream-consumers/index.js"],
  ["dns/promises", "dns/promises.js"],
  ["dns", "dns/index.js"],
  ["assert/strict", "assert/index.cjs"],
  ["assert", "assert/index.cjs"],
  ["perf_hooks", "perf-hooks/index.js"],
  ["trace_events", "trace-events/index.js"],
  ["https", "https/index.js"],
  ["worker_threads", "worker-threads/index.js"],
  ["node:test", "test/index.js"],
  ["node:sqlite", "sqlite/index.js"],
  ["repl", "repl/index.js"],
  ["vm", "vm/index.js"],
  ["http2", "http2/index.js"],
  ["constants", "constants/index.js"],
  ["v8", "v8/index.js"],
  ["wasi", "wasi/index.js"],
  ["os", "os/index.js"],
  ["tty", "tty/index.js"],
  ["url", "url/index.js"],
  ["diagnostics_channel", "diagnostics-channel/index.js"],
  ["_tls_common", "tls-common/index.js"],
  ["async_hooks", "async-hooks/index.js"],
  ["timers/promises", "timers/promises.js"],
  ["timers", "timers/index.js"],
  ["fs/promises", "fs/promises/index.js"],
  ["fs", "fs/index.js"],
  ["module", "module/index.js"],
  ["_stream_readable", "stream-readable/index.js", "stream-readable/index.cjs"],
  ["_stream_writable", "stream-writable/index.js", "stream-writable/index.cjs"],
  ["_stream_duplex", "stream-duplex/index.js", "stream-duplex/index.cjs"],
  [
    "_stream_transform",
    "stream-transform/index.js",
    "stream-transform/index.cjs",
  ],
  [
    "_stream_passthrough",
    "stream-passthrough/index.js",
    "stream-passthrough/index.cjs",
  ],
  ["stream/web", "stream-web/index.js"],
  ["util", "util/index.js"],
  ["buffer", "buffer/index.js"],
  ["_http_agent", "http-agent/index.js"],
  ["_http_client", "http-client/index.js"],
  ["_http_incoming", "http-incoming/index.js"],
  ["http", "http/index.js"],
  ["net", "net/index.js"],
  ["stream", "stream/index.js", "stream/index.cjs"],
  ["path/win32", "path/win32/index.js"],
  ["path/posix", "path/posix/index.js"],
  ["path", "path/index.js"],
  ["querystring", "querystring/index.js"],
  ["string_decoder", "string-decoder/index.js"],
];

function builtinAliases(commonJS = false): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, esm, cjs] of builtins) {
    if (commonJS && !cjs) continue;
    const path = fileURLToPath(
      new URL(`../compat/${commonJS ? cjs : esm}`, import.meta.url),
    );
    result[name] = path;
    if (!name.startsWith("node:")) result[`node:${name}`] = path;
  }
  return Object.fromEntries(
    Object.entries(result).sort(([a], [b]) => b.length - a.length),
  );
}

export function compatibilityAliases(): Record<string, string> {
  return {
    "process/": stdlib.process,
    "cloudflare:node": workersModulePath("cloudflare-node"),
    "cloudflare:workers": workersModulePath("cloudflare-workers"),
    "punycode/": polyfill("punycode/punycode.js"),
    "util/util.js": polyfill("util/util.js"),
    "string_decoder/lib/string_decoder.js": polyfill(
      "string_decoder/lib/string_decoder.js",
    ),
    ...builtinAliases(),
  };
}

export function commonJSCompatibilityAliases(): Record<string, string> {
  return builtinAliases(true);
}

export function compatibilityDependencies(): string[] {
  return [
    "cloudflare:node",
    "cloudflare:workers",
    ...Object.keys(builtinAliases()),
  ];
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
  return `import createWorker from ${JSON.stringify(factoryImport)};\n${selector ? `import { needsRemote, requiresRemote } from ${JSON.stringify(selector)};` : ""}\nimport { installNodeGlobals } from ${JSON.stringify(globalsPath)};\nexport default { createWorker, ${selector ? "needsRemote, requiresRemote," : ""} async loadDirect() {\n  const dispose = installNodeGlobals();\n  try {\n    return { handler: (await import(${JSON.stringify(entry)})).default, dispose };\n  } catch (error) {\n    dispose();\n    throw error;\n  }\n} };`;
}

export const globalsInjectPath = fileURLToPath(
  new URL("../shared/globals/inject.js", import.meta.url),
);
