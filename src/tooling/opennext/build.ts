// Runs in a child process so OpenNext's cwd and globals cannot affect Vite/esbuild.
import { readFile, writeFile, readdir, stat, cp } from "node:fs/promises";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import { transform } from "esbuild";
const [app, cli, output, selectedJSON] = process.argv.slice(2);
const load = (path: string) => import(pathToFileURL(path).href);
const { getNormalizedOptions, readWranglerConfig } = await load(
  join(cli, "commands/utils/utils.js"),
);
const { build } = await load(join(cli, "build/build.js"));
const { default: config } = await load(
  join(app, ".open-next/.build/open-next.config.mjs"),
);
const { defineCloudflareConfig } = await load(join(cli, "../api/config.js"));
const stock = defineCloudflareConfig({
  incrementalCache: "dummy",
  tagCache: "dummy",
  queue: "dummy",
});
const signature = (value: unknown) =>
  JSON.stringify(value, (_key, item) =>
    typeof item === "function" ? item.toString().replace(/\s/g, "") : item,
  );
async function normalized(value: typeof config) {
  const resolver = value.middleware?.assetResolver?.();
  if (
    !resolver ||
    Object.keys(resolver).sort().join() !== "maybeGetAssetResult,name"
  )
    return "unsupported";
  const code = (
    await transform(`({${resolver.maybeGetAssetResult.toString()}})`, {
      minifySyntax: true,
      minifyWhitespace: true,
      legalComments: "none",
    })
  ).code;
  return signature({
    ...value,
    middleware: {
      ...value.middleware,
      assetResolver: { name: resolver.name, code },
    },
  });
}
let supported = false;
try {
  supported = (await normalized(config)) === (await normalized(stock));
} catch {
  /* Unknown custom configuration stays remote. */
}
if (!supported) {
  await writeFile(
    join(dirname(output), "unsupported.json"),
    JSON.stringify("Custom OpenNext configuration requires remote execution"),
  );
  process.exit(0);
}
const paths = JSON.parse(
  await readFile(join(app, ".next/server/app-paths-manifest.json"), "utf8"),
);
const selected = new Set<string>(JSON.parse(selectedJSON));
config.default.override.assetResolver = "dummy";
config.middleware = {
  ...config.middleware,
  external: true,
  assetResolver: "dummy",
};
config.functions = {
  remote: {
    ...config.default,
    routes: Object.values<string>(paths)
      .filter((file) => !selected.has(file))
      .map((file) => file.replace(/\.js$/, "")),
    patterns: ["*"],
  },
};
const compiled = join(dirname(output), "config");
await cp(join(app, ".open-next/.build"), compiled, { recursive: true });
const serialized = JSON.stringify(config, (_key, value) => {
  if (typeof value === "function")
    throw Error("Custom OpenNext runtime functions require remote execution");
  return value;
});
for (const name of ["open-next.config.mjs", "open-next.config.edge.mjs"])
  await writeFile(join(compiled, name), `export default ${serialized};`);
const options = getNormalizedOptions(config, compiled);
options.outputDir = output;
options.buildDir = join(output, ".build");
await build(
  options,
  config,
  { minify: true, skipNextBuild: true, sourceDir: app },
  await readWranglerConfig({}),
);
await cp(
  join(app, ".open-next/cloudflare/next-env.mjs"),
  join(output, "cloudflare/next-env.mjs"),
);

// The local renderer must not share the deployed build's preview/action keys.
// This isolates these framework-generated values, not arbitrary application secrets.
const preview = JSON.parse(
  await readFile(join(app, ".next/prerender-manifest.json"), "utf8"),
).preview;
const actions = JSON.parse(
  await readFile(
    join(app, ".next/server/server-reference-manifest.json"),
    "utf8",
  ),
);
const replacements = new Map<string, string>();
for (const value of Object.values<string>(preview)) {
  if (typeof value !== "string" || !/^[a-f0-9]{16,}$/i.test(value))
    throw Error("Unsupported OpenNext preview key format");
  replacements.set(value, randomBytes(value.length / 2).toString("hex"));
}
if (
  typeof actions.encryptionKey !== "string" ||
  actions.encryptionKey.length < 16
)
  throw Error("Unsupported OpenNext action key format");
replacements.set(actions.encryptionKey, randomBytes(32).toString("base64"));
for (const directory of ["cloudflare", "server-functions/default"]) {
  const root = join(output, directory);
  for (const name of await readdir(root, { recursive: true })) {
    if (!/\.(?:[cm]?js|json)$/.test(name)) continue;
    const file = join(root, name);
    if (!(await stat(file)).isFile()) continue;
    const original = await readFile(file, "utf8");
    let code = original;
    for (const [from, to] of replacements) code = code.replaceAll(from, to);
    if (code !== original) await writeFile(file, code);
  }
}
// Only routes proven not to match middleware reach this entry. Do not import
// the original middleware, image service or Durable Object implementations.
await writeFile(
  join(output, "local-worker.js"),
  `
import {runWithCloudflareRequestContext} from "./cloudflare/init.js";
export default {fetch(request, env, ctx) {
  return runWithCloudflareRequestContext(request, env, ctx, async () => {
    const {handler} = await import("./server-functions/default/handler.mjs");
    return handler(request, env, ctx, request.signal);
  });
}};
`,
);
