import { existsSync } from "node:fs";
import { readFile, mkdir, mkdtemp, rm, readdir } from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import { createRequire, builtinModules } from "node:module";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { build } from "esbuild";
import {
  compileServerWorker,
  type ServerCompilation,
  type LocalRoute,
} from "../server.js";
import { planRoutes, selector } from "./plan.js";
import { publicEnvironment, applicationCloudflareContext } from "./safety.js";

/** Adapt a generated OpenNext App Router build to the shared compiler result. */
export async function compileOpenNext(
  entry: string,
  permissions: readonly LocalRoute[],
  bindings: string[],
): Promise<ServerCompilation | undefined> {
  const directory = dirname(entry);
  if (
    basename(entry) !== "worker.js" ||
    basename(directory) !== ".open-next" ||
    !existsSync(join(directory, ".build/open-next.config.mjs"))
  )
    return;
  const app = dirname(directory);
  const remote = await compileServerWorker(entry, bindings, {
    execution: "network",
  });
  const inputs = [
    ...remote.inputs,
    join(directory, ".build/open-next.config.mjs"),
    join(directory, "cloudflare/next-env.mjs"),
    ...(existsSync(join(app, ".next"))
      ? await readdir(join(app, ".next"), { recursive: true })
      : []
    )
      .filter(
        (file) =>
          /\.(?:json|[cm]?js)$/.test(file) && !file.startsWith("standalone/"),
      )
      .map((file) => join(app, ".next", file)),
  ];
  const reject = (reason: string) => ({
    ...remote,
    inputs,
    reason,
    routes: remote.routes.map((route) => ({ ...route, reason })),
  });
  const require = createRequire(join(app, "package.json"));
  const packageFile = join(
    dirname(require.resolve("@opennextjs/cloudflare")),
    "../../package.json",
  );
  const version = JSON.parse(await readFile(packageFile, "utf8")).version;
  const next = JSON.parse(
    await readFile(require.resolve("next/package.json"), "utf8"),
  ).version;
  if (version !== "1.20.12" || next !== "16.4.2")
    return reject(
      "Route splitting requires OpenNext 1.20.12 and Next.js 16.4.2; update older applications",
    );
  const json = async (file: string) =>
    JSON.parse(await readFile(join(app, ".next", file), "utf8"));
  if (
    !publicEnvironment(
      await readFile(join(directory, "cloudflare/next-env.mjs"), "utf8"),
    )
  )
    return reject(
      "OpenNext environment exports contain non-public or unrecognized data",
    );
  const required = await json("required-server-files.json");
  if (
    Object.keys(required.config?.env ?? {}).some(
      (key) => !key.startsWith("NEXT_PUBLIC_"),
    ) ||
    Object.keys(required.config?.serverRuntimeConfig ?? {}).length
  )
    return reject("Next.js configuration contains server environment data");
  const routesManifest = await json("routes-manifest.json");
  if (
    routesManifest.basePath ||
    routesManifest.headers?.length ||
    routesManifest.redirects?.some(
      (route: { internal?: boolean }) => !route.internal,
    ) ||
    Object.values(routesManifest.rewrites ?? {}).some(
      (value) => Array.isArray(value) && value.length,
    )
  )
    return reject(
      "OpenNext headers, redirects, rewrites or basePath require remote execution",
    );
  if (!existsSync(join(app, ".next/server/webpack-runtime.js")))
    return reject(
      "OpenNext Next.js 16 route splitting requires Webpack output",
    );
  const functionsFile = "server/functions-config-manifest.json";
  if (existsSync(join(app, ".next", functionsFile))) {
    const functions = await json(functionsFile);
    if (
      functions.version !== 1 ||
      !functions.functions ||
      typeof functions.functions !== "object" ||
      Array.isArray(functions.functions) ||
      Object.hasOwn(functions.functions, "/_middleware")
    )
      return reject(
        "OpenNext Node middleware or unknown functions require remote execution",
      );
  } else {
    return reject(
      "Missing OpenNext functions manifest requires remote execution",
    );
  }
  const middleware = await json("server/middleware-manifest.json");
  const patterns: string[] = [];
  for (const value of Object.values(middleware.middleware ?? {}) as {
    matchers?: { regexp?: string }[];
  }[]) {
    if (
      !value.matchers?.length ||
      value.matchers.some((m) => typeof m.regexp !== "string")
    )
      return reject("Unresolved OpenNext middleware requires remote execution");
    patterns.push(...value.matchers.map((m) => m.regexp!));
  }
  const paths = await json("server/app-paths-manifest.json");
  const plan = planRoutes(paths, permissions, patterns);
  const selected = plan.filter((route) => !route.remote);
  if (!selected.length)
    return reject(
      "No permitted OpenNext routes can be separated from server middleware",
    );
  const cache = join(app, "node_modules/.cache/workers-capacitor/opennext");
  await mkdir(cache, { recursive: true });
  const temporary = await mkdtemp(join(cache, "routes-"));
  const output = join(temporary, ".open-next");
  const dispose = () => rm(temporary, { recursive: true, force: true });
  try {
    try {
      await promisify(execFile)(
        process.execPath,
        [
          fileURLToPath(new URL("./build.js", import.meta.url)),
          app,
          join(dirname(packageFile), "dist/cli"),
          output,
          JSON.stringify(selected.map((route) => route.file)),
        ],
        { cwd: app, maxBuffer: 8 * 1024 * 1024 },
      );
    } catch {
      // Upstream failures must never fall back to distributing the unsplit server.
      return reject(
        "OpenNext route compilation could not isolate the selected generated routes",
      );
    }
    const unsupported = join(temporary, "unsupported.json");
    if (existsSync(unsupported))
      return reject(JSON.parse(await readFile(unsupported, "utf8")));
    const localEntry = join(output, "local-worker.js");
    const choose = selector(selected.map((route) => route.path));
    // Check the reachable generated graph, not copied but unused server files.
    const graph = await build({
      stdin: {
        contents: `${choose}
import worker from ${JSON.stringify(localEntry)};
export default {fetch(request, env, ctx) {
  if (needsRemote(request)) throw new Error("Server route reached local dispatch");
  return worker.fetch(request, env, ctx);
}};`,
        resolveDir: app,
      },
      bundle: true,
      plugins: [
        {
          name: "builtin-requires",
          setup(build) {
            build.onResolve({ filter: /.*/ }, (args) => {
              if (args.path.startsWith("cloudflare:"))
                return { path: args.path, external: true };
              if (!builtinModules.includes(args.path.replace(/^node:/, "")))
                return;
              return args.kind === "require-call"
                ? { path: args.path, namespace: "builtin-require" }
                : { path: args.path, external: true };
            });
            build.onLoad(
              { filter: /.*/, namespace: "builtin-require" },
              (args) => ({
                contents: `import * as value from ${JSON.stringify(args.path)}; module.exports = value.default ?? value;`,
                loader: "js",
              }),
            );
          },
        },
      ],
      platform: "browser",
      format: "esm",
      write: false,
      metafile: true,
      logLevel: "silent",
    });
    const code = graph.outputFiles[0].text;
    if (applicationCloudflareContext(code))
      return reject(
        "Selected OpenNext dependencies access a Cloudflare environment",
      );
    for (const binding of bindings) {
      const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${escaped}\\b`).test(code))
        return reject(
          `Selected OpenNext output still references server binding ${binding}`,
        );
    }
    const preview = await json("prerender-manifest.json");
    const actions = await json("server/server-reference-manifest.json");
    for (const key of [
      ...Object.values<string>(preview.preview),
      actions.encryptionKey,
    ])
      if (code.includes(key))
        throw new Error("OpenNext output retained a server-generated key");
    // Freeze absent optional requires too: a later bundler alias must not turn
    // an uninspected dependency into distributed application code.
    const unavailable = new Set(
      Object.values(graph.metafile.outputs)
        .flatMap((value) => value.imports)
        .filter(
          (value) => !builtinModules.includes(value.path.replace(/^node:/, "")),
        )
        .map((value) => value.path),
    );
    const frozen = await build({
      stdin: { contents: code, resolveDir: app },
      bundle: true,
      platform: "browser",
      format: "esm",
      write: false,
      logLevel: "silent",
      external: [
        ...builtinModules,
        ...builtinModules.map((name) => `node:${name}`),
      ],
      plugins: [
        {
          name: "freeze-unavailable-modules",
          setup(build) {
            build.onResolve({ filter: /.*/ }, (args) =>
              unavailable.has(args.path)
                ? { path: args.path, namespace: "unavailable" }
                : undefined,
            );
            build.onLoad({ filter: /.*/, namespace: "unavailable" }, () => ({
              contents:
                'throw Object.assign(new Error("Module is unavailable in the local renderer"), {code:"MODULE_NOT_FOUND"});',
              loader: "js",
            }));
          },
        },
      ],
    });
    return {
      mode: "routes",
      inputs,
      routes: plan.map((route) => ({
        router: "opennext",
        method: "get",
        path: route.path,
        remote: route.remote,
        reason: route.reason,
      })),
      selector: choose,
      local: frozen.outputFiles[0].text,
    };
  } finally {
    await dispose();
  }
}
