import { readFile } from "node:fs/promises";
import { dirname, basename, resolve, join } from "node:path";
import { createRequire, builtinModules } from "node:module";
import { build } from "esbuild";
import {
  compileServerWorker,
  type LocalRoute,
  type ServerCompilation,
} from "../server.js";
import { permitsPath } from "../route-permissions.js";
import {
  readVoidPlan,
  voidSelector,
  usesServerProcess,
  voidRoutingStart,
} from "./plan.js";

/** Generated Void Pages builds only. Unknown generators keep the Worker boundary. */
export async function compileVoid(
  entry: string,
  permissions: readonly LocalRoute[],
  bindings: string[],
): Promise<ServerCompilation | undefined> {
  if (basename(entry) !== "index.js" || basename(dirname(entry)) !== "ssr")
    return;
  const source = await readFile(entry, "utf8");
  if (voidRoutingStart(source) < 0) return;
  const remote = await compileServerWorker(entry, bindings, {
    execution: "network",
  });
  const reject = (reason: string): ServerCompilation => ({
    ...remote,
    reason,
    routes: remote.routes.map((route) => ({ ...route, reason })),
  });
  const directory = dirname(entry);
  const require = createRequire(entry);
  const runtimeRoot = dirname(require.resolve("void"));
  const versionFile = join(runtimeRoot, "../package.json");
  if (JSON.parse(await readFile(versionFile, "utf8")).version !== "1.1.12")
    return reject("Void route execution currently requires Void 1.1.12");
  let plan: ReturnType<typeof readVoidPlan>;
  try {
    plan = readVoidPlan(source);
  } catch (error) {
    return reject(
      error instanceof Error ? error.message : "Unknown Void build",
    );
  }
  const inputs = new Set([...remote.inputs, versionFile]);
  const checked = new Map<string, { unsafe: boolean; code: string }>();
  // Inspect the exact generated dependency graph, including imported helpers. No
  // server source is read by the device and no arbitrary secret scanner is used.
  async function prepareModule(file: string, names?: string[]) {
    const key = file + ":" + (names?.join(",") ?? "*");
    if (checked.has(key)) return checked.get(key)!;
    const result = await build({
      ...(names
        ? {
            stdin: {
              contents: `import * as selected from ${JSON.stringify(resolve(directory, file))};\n${names.map((name) => `export const ${name}=selected.${name};`).join("\n")}`,
              resolveDir: directory,
            },
          }
        : { entryPoints: [resolve(directory, file)] }),
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      conditions: ["worker", "browser"],
      external: [
        ...builtinModules,
        ...builtinModules.map((name) => `node:${name}`),
        "cloudflare:*",
      ],
      metafile: true,
      logLevel: "silent",
    });
    for (const path of Object.keys(result.metafile!.inputs))
      if (path !== "<stdin>") inputs.add(resolve(path));
    const code = result.outputFiles[0].text;
    const unsafe =
      usesServerProcess(code) ||
      /cloudflare:|void\.envContext|\.\s*env\b|\[\s*["']env["']\s*\]|\bglobalThis\s*(?:\[|\.\s*(?:__env__|env))|\b(?:getRuntimeBinding|requireRuntimeBinding|getRuntimeEnv|getRawRuntimeEnv)\b/.test(
        code,
      ) ||
      bindings.some((name) =>
        new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(
          code,
        ),
      ) ||
      Object.values(result.metafile!.outputs).some((output) =>
        output.imports.some((item) => item.external),
      );
    const prepared = { unsafe, code };
    checked.set(key, prepared);
    return prepared;
  }
  const routes: ServerCompilation["routes"] = [];
  const selected: typeof plan.routes = [];
  for (const route of plan.routes) {
    let reason: string | undefined;
    if (
      route.method !== "GET" ||
      !permissions.some(
        (permission) =>
          (permission.method === "GET" || permission.method === "*") &&
          permitsPath(permission, route.path),
      )
    )
      reason = "Route distribution was not permitted by execution";
    else if (/[\:*?{}]/.test(route.path) || route.path.startsWith("/__void"))
      reason =
        "Dynamic and framework-internal Void routes require network execution";
    else if (
      (route.module &&
        (
          await prepareModule(
            route.module,
            route.component ? ["loader", "head"] : ["GET"],
          )
        ).unsafe) ||
      (route.component &&
        (await prepareModule(plan.componentPath(route.component))).unsafe)
    )
      reason = "Void route dependencies require the server environment";
    if (!reason) selected.push(route);
    routes.push({
      router: "void",
      method: route.method,
      path: route.path,
      remote: !!reason,
      reason: reason ?? "Generated GET route distribution explicitly permitted",
    });
  }
  if (!selected.length)
    return {
      ...reject("No permitted Void routes can execute locally"),
      routes,
      inputs: [...inputs],
    };
  const selector = voidSelector(selected.map((route) => route.path));
  const components = selected.flatMap((route) =>
    route.component ? [route.component] : [],
  );
  const renderer = components.length
    ? plan.renderer(components)
    : "export const renderPage = undefined;";
  const manifestFile = resolve(directory, "../client/.vite/manifest.json");
  const manifest = components.length
    ? JSON.parse(await readFile(manifestFile, "utf8"))
    : {};
  if (components.length) inputs.add(manifestFile);
  const entryCode = `
    import { Hono } from ${JSON.stringify(require.resolve("hono"))};
    import { createRoutingRuntime, createModuleLoader, createPageGetHandler,
      createHttpRouteHandler, createClientAssetTags } from ${JSON.stringify(join(runtimeRoot, "runtime/routing.mjs"))};
    import { renderPage } from "capacitor:void-renderer";
    ${selector}
    const app = new Hono();
    const routing = createRoutingRuntime(app, {dev:false,nodeTarget:false,managedDispatch:false});
    app.use(routing.contextMiddleware);
    app.use(routing.requestMiddleware);
    const assets = createClientAssetTags(${JSON.stringify(plan.assets)},async()=>(${JSON.stringify(manifest)}));
    ${selected
      .map((route, index) => {
        const load = route.module
          ? `createModuleLoader(()=>import("capacitor:void-module:${index}"))`
          : "undefined";
        const handler = route.component
          ? `createPageGetHandler({load:${load},componentId:${JSON.stringify(route.component)},render:renderPage,assets,headConfig:null,renderOptions:{renderMode:${JSON.stringify(route.renderMode)}}})`
          : `createHttpRouteHandler(${load},"GET")`;
        return `app.get(${JSON.stringify(route.path)},${handler});`;
      })
      .join("\n")}
    export default {fetch(request,env,ctx) {
      if(needsRemote(request)) throw new Error("Void request requires network execution");
      return app.fetch(request,env,ctx);
    }};
  `;
  const bundled = await build({
    stdin: {
      contents: entryCode,
      resolveDir: directory,
      sourcefile: "capacitor-void.js",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    conditions: ["worker", "browser"],
    external: ["node:*", "cloudflare:*"],
    metafile: true,
    logLevel: "silent",
    plugins: [
      {
        name: "capacitor-void-renderer",
        setup(build) {
          build.onResolve({ filter: /^capacitor:void-module:/ }, (args) => ({
            path: args.path.slice("capacitor:void-module:".length),
            namespace: "void-module",
          }));
          build.onLoad(
            { filter: /.*/, namespace: "void-module" },
            async (args) => {
              const route = selected[Number(args.path)];
              const prepared = await prepareModule(
                route.module!,
                route.component ? ["loader", "head"] : ["GET"],
              );
              return {
                contents: prepared.code,
                resolveDir: directory,
                loader: "js",
              };
            },
          );
          build.onResolve({ filter: /^capacitor:void-renderer$/ }, () => ({
            path: "renderer",
            namespace: "void-renderer",
          }));
          build.onLoad({ filter: /.*/, namespace: "void-renderer" }, () => ({
            contents: renderer,
            resolveDir: directory,
            loader: "js",
          }));
        },
      },
    ],
  });
  for (const path of Object.keys(bundled.metafile!.inputs)) {
    if (
      !path.startsWith("void-renderer:") &&
      !path.startsWith("void-module:") &&
      path !== "capacitor-void.js"
    )
      inputs.add(resolve(path));
  }
  return {
    mode: "routes",
    local: bundled.outputFiles[0].text,
    selector,
    inputs: [...inputs],
    routes,
  };
}
