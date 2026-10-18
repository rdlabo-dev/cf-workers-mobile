import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { build, type BuildOptions } from "esbuild";
import { parseAst } from "rollup/parseAst";
import { parse as parseJSON, type ParseError } from "jsonc-parser";
import { parse as parseTOML } from "smol-toml";
import type {
  Node,
  Expression,
  CallExpression,
  VariableDeclarator,
} from "estree";

export interface D1BuildOptions {
  /** Existing Wrangler JSON, JSONC or TOML configuration. Auto-detected in the build root. */
  workerConfig?: string;
  /** Binding names when configuration is supplied by another tool. No route annotations. */
  d1Bindings?: string[];
  /** Names explicitly supplied through capacitorWorkers({ env }); other env access stays on the server. */
  localBindings?: string[];
}
export interface D1Compilation {
  mode: "routes" | "worker";
  reason?: string;
  local: string;
  selector: string;
  inputs: string[];
  routes: { router: string; method: string; path: string; remote: boolean }[];
}
class WiderServerBoundary extends Error {}
export async function d1Bindings(root: string, options: D1BuildOptions) {
  if (options.d1Bindings) {
    if (options.d1Bindings.some((name) => !name || typeof name !== "string"))
      throw new TypeError("d1Bindings must contain nonempty binding names");
    return { names: [...new Set(options.d1Bindings)], config: undefined };
  }
  const file = options.workerConfig
    ? resolve(root, options.workerConfig)
    : ["wrangler.jsonc", "wrangler.json", "wrangler.toml"]
        .map((name) => resolve(root, name))
        .find(existsSync);
  if (!file) return { names: [], config: undefined };
  const source = await readFile(file, "utf8");
  const errors: ParseError[] = [];
  const config = file.endsWith(".toml")
    ? parseTOML(source)
    : parseJSON(source, errors, { allowTrailingComma: true });
  if (errors.length) throw new Error(`Invalid Worker configuration: ${file}`);
  const typed = config as {
    d1_databases?: { binding: string }[];
    env?: Record<string, { d1_databases?: { binding: string }[] }>;
  };
  if (!typed || typeof typed !== "object")
    throw new Error(`Invalid Worker configuration: ${file}`);
  const groups = [
    typed.d1_databases ?? [],
    ...Object.values(typed.env ?? {}).map(
      (environment) => environment.d1_databases ?? [],
    ),
  ];
  if (
    groups.some(
      (bindings) =>
        !Array.isArray(bindings) ||
        bindings.some(
          (item) => typeof item?.binding !== "string" || !item.binding,
        ),
    )
  )
    throw new Error(`Invalid d1_databases in ${file}`);
  return {
    names: [...new Set(groups.flat().map((item) => item.binding))],
    config: file,
  };
}

function walk(
  node: Node,
  visit: (node: Node, parent?: Node) => void,
  parent?: Node,
) {
  visit(node, parent);
  for (const value of Object.values(node)) {
    const children = Array.isArray(value) ? value : [value];
    for (const child of children)
      if (child && typeof child === "object" && typeof child.type === "string")
        walk(child as Node, visit, node);
  }
}
function names(node: Node) {
  const result = new Set<string>();
  walk(node, (child) => {
    if (child.type === "Identifier") result.add(child.name);
  });
  return result;
}
function property(node: Node): string | undefined {
  if (node.type !== "MemberExpression") return;
  if (!node.computed && node.property.type === "Identifier")
    return node.property.name;
  if (
    node.computed &&
    node.property.type === "Literal" &&
    typeof node.property.value === "string"
  )
    return node.property.value;
}
const routeMethods = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "all",
  "on",
  "use",
]);

/** Bundle local modules first so imported/re-exported helpers share one dependency graph. */
export async function compileD1Worker(
  entry: string,
  bindings: string[],
  options: Pick<
    BuildOptions,
    "alias" | "tsconfig" | "define" | "conditions"
  > & { localBindings?: string[] } = {},
): Promise<D1Compilation> {
  const { localBindings = [], ...buildOptions } = options;
  if (localBindings.some((name) => bindings.includes(name)))
    throw new Error("A D1 binding cannot also be a local binding");
  const bundled = await build({
    ...buildOptions,
    absWorkingDir: dirname(entry),
    entryPoints: [entry],
    bundle: true,
    packages: "external",
    format: "esm",
    platform: "neutral",
    write: false,
    metafile: true,
    treeShaking: true,
    target: "es2022",
    legalComments: "none",
    logLevel: "silent",
  });
  const source = bundled.outputFiles[0].text;
  const inputs = Object.keys(bundled.metafile.inputs).map((file) =>
    resolve(dirname(entry), file),
  );
  try {
    return partition(source, bindings, inputs, localBindings);
  } catch (error) {
    if (!(error instanceof WiderServerBoundary)) throw error;
    return {
      mode: "worker",
      reason: error.message,
      inputs,
      local:
        'export default { fetch() { throw new Error("Server-only Worker reached local dispatch"); } };',
      selector: "export function needsRemote() { return true; }",
      routes: [{ router: "worker", method: "all", path: "*", remote: true }],
    };
  }
}
function partition(
  source: string,
  bindings: string[],
  inputs: string[],
  localBindings: string[],
): D1Compilation {
  const program = parseAst(source);
  const text = (node: Node) => {
    const span = node as Node & { start: number; end: number };
    return source.slice(span.start, span.end);
  };
  function fail(message: string): never {
    throw new WiderServerBoundary(message);
  }
  const declarations = new Map<string, Node>();
  const variables = new Map<string, VariableDeclarator>();
  const constructors = new Set<string>();
  const environmentImports = new Set<string>();
  const opaqueImports = new Set<string>();
  const routerInitializers = new Map<string, string>();
  const routerNodes = new Map<string, Node>();
  const writes = new Map<string, Node[]>();
  const mutable = new Set<string>();
  const remoteState = new Set<string>();
  const registrations = new Map<
    Node,
    { router: string; call: CallExpression }[]
  >();
  let exported: string | undefined;

  for (const statement of program.body) {
    if (statement.type === "ImportDeclaration") {
      if (!statement.specifiers.length)
        fail(`side-effect import ${statement.source.value} has no route owner`);
      for (const specifier of statement.specifiers) {
        declarations.set(specifier.local.name, statement);
        if (
          typeof statement.source.value !== "string" ||
          (statement.source.value !== "hono" &&
            !statement.source.value.startsWith("hono/"))
        )
          opaqueImports.add(specifier.local.name);
        if (
          statement.source.value === "hono" &&
          specifier.type === "ImportSpecifier" &&
          specifier.imported.type === "Identifier" &&
          specifier.imported.name === "Hono"
        )
          constructors.add(specifier.local.name);
        if (
          statement.source.value === "cloudflare:workers" &&
          specifier.type === "ImportSpecifier" &&
          specifier.imported.type === "Identifier" &&
          specifier.imported.name === "env"
        )
          environmentImports.add(specifier.local.name);
      }
    } else if (statement.type === "VariableDeclaration") {
      if (statement.declarations.length !== 1)
        fail("combined declarations need separate dependency ownership");
      const declaration = statement.declarations[0];
      if (declaration.id.type !== "Identifier")
        fail("top-level destructuring needs separate dependency ownership");
      declarations.set(declaration.id.name, statement);
      variables.set(declaration.id.name, declaration);
      if (
        !declaration.init ||
        !["Literal", "ArrowFunctionExpression", "FunctionExpression"].includes(
          declaration.init.type,
        )
      )
        mutable.add(declaration.id.name);
    } else if (
      (statement.type === "FunctionDeclaration" ||
        statement.type === "ClassDeclaration") &&
      statement.id
    ) {
      declarations.set(statement.id.name, statement);
    } else if (statement.type === "ExportNamedDeclaration") {
      for (const specifier of statement.specifiers)
        if (
          (specifier.exported.type === "Identifier"
            ? specifier.exported.name
            : specifier.exported.value) === "default" &&
          specifier.local.type === "Identifier"
        )
          exported = specifier.local.name;
      if (
        statement.declaration ||
        statement.specifiers.length !== 1 ||
        !exported
      )
        fail(
          "additional Worker exports require their own execution boundaries",
        );
    } else if (
      statement.type !== "ExpressionStatement" &&
      statement.type !== "EmptyStatement"
    )
      fail(`unsupported top-level ${statement.type}`);
  }
  walk(program, (child) => {
    if (
      child.type !== "AssignmentExpression" &&
      child.type !== "UpdateExpression"
    )
      return;
    let target: Node =
      child.type === "AssignmentExpression" ? child.left : child.argument;
    while (target.type === "MemberExpression") target = target.object;
    if (target.type === "Identifier" && variables.has(target.name)) {
      mutable.add(target.name);
      if (child.type === "AssignmentExpression")
        writes.set(target.name, [
          ...(writes.get(target.name) ?? []),
          child.right,
        ]);
    }
  });
  function chain(node: Expression): {
    root: Expression;
    calls: CallExpression[];
  } {
    if (
      node.type === "CallExpression" &&
      node.callee.type === "MemberExpression" &&
      node.callee.object.type !== "Super"
    ) {
      const inner = chain(node.callee.object);
      return { root: inner.root, calls: [...inner.calls, node] };
    }
    return { root: node, calls: [] };
  }
  for (const [name, declaration] of variables) {
    if (!declaration.init) continue;
    const sequence = chain(declaration.init);
    if (
      sequence.root.type === "NewExpression" &&
      sequence.root.callee.type === "Identifier" &&
      constructors.has(sequence.root.callee.name)
    ) {
      const args = sequence.root.arguments;
      if (
        args.length &&
        (args.length !== 1 ||
          args[0].type !== "ObjectExpression" ||
          args[0].properties.some(
            (p) =>
              p.type !== "Property" ||
              p.computed ||
              p.key.type !== "Identifier" ||
              p.key.name !== "strict" ||
              p.value.type !== "Literal" ||
              typeof p.value.value !== "boolean",
          ))
      )
        fail(`custom router construction for ${name} needs matching analysis`);
      let initializer = text(sequence.root);
      if (
        sequence.calls[0] &&
        property(sequence.calls[0].callee) === "basePath"
      ) {
        const call = sequence.calls.shift()!;
        if (
          call.arguments.length !== 1 ||
          call.arguments[0].type !== "Literal" ||
          typeof call.arguments[0].value !== "string"
        )
          fail("basePath requires a static path");
        initializer += `.basePath(${text(call.arguments[0])})`;
      }
      routerInitializers.set(name, `const ${name} = ${initializer};`);
      routerNodes.set(name, declarations.get(name)!);
      if (sequence.calls.length)
        registrations.set(
          declarations.get(name)!,
          sequence.calls.map((call) => ({ router: name, call })),
        );
    }
  }
  if (!routerNodes.size)
    fail("no statically constructed Hono router was found");
  function rootRouter(name: string, seen = new Set<string>()): string {
    if (routerNodes.has(name)) return name;
    if (seen.has(name)) return fail("cyclic router alias");
    seen.add(name);
    const value = variables.get(name)?.init;
    if (value?.type === "Identifier") return rootRouter(value.name, seen);
    return fail(`default export ${name} is not an existing router`);
  }
  const root = exported
    ? rootRouter(exported)
    : fail("missing default Worker export");
  for (const statement of program.body)
    if (statement.type === "ExpressionStatement") {
      const sequence = chain(statement.expression);
      if (sequence.root.type !== "Identifier" || !sequence.calls.length)
        fail(
          "top-level side effects or dynamic router registration need an explicit execution boundary",
        );
      const router = rootRouter(sequence.root.name);
      registrations.set(
        statement,
        sequence.calls.map((call) => ({ router, call })),
      );
    }
  function closure(nodes: Node[]) {
    const result = new Set(nodes.flatMap((node) => [...names(node)]));
    for (const name of result) {
      const declaration = declarations.get(name);
      if (declaration && !routerNodes.has(name))
        for (const dependency of names(declaration)) result.add(dependency);
      for (const value of writes.get(name) ?? [])
        for (const dependency of names(value)) result.add(dependency);
    }
    return result;
  }
  function server(nodes: Node[]) {
    const dependencies = closure(nodes);
    if (
      [...dependencies].some(
        (name) =>
          bindings.includes(name) ||
          environmentImports.has(name) ||
          opaqueImports.has(name) ||
          remoteState.has(name),
      )
    )
      return true;
    let remote = false;
    for (const node of [
      ...nodes,
      ...[...dependencies]
        .flatMap((name) => [
          declarations.get(name),
          ...(writes.get(name) ?? []),
        ])
        .filter((n): n is Node => !!n),
    ])
      walk(node, (child, parent) => {
        const key = property(child);
        if (key && bindings.includes(key)) remote = true;
        if (key === "constructor" || key === "__proto__") remote = true;
        // Passing an environment to unknown code or computing property names expands
        // the whole operation's server boundary, never retries a partially run route.
        if (
          key === "env" &&
          (parent?.type !== "MemberExpression" ||
            parent.object !== child ||
            !localBindings.includes(property(parent) ?? ""))
        )
          remote = true;
        if (
          child.type === "MemberExpression" &&
          child.computed &&
          child.property.type !== "Literal"
        )
          remote = true;
        if (
          child.type === "ImportExpression" ||
          (child.type === "Identifier" &&
            ["eval", "Function", "Reflect", "Proxy"].includes(child.name))
        )
          remote = true;
      });
    return remote;
  }
  function staticPath(node: Node, seen = new Set<string>()): boolean {
    if (node.type === "Literal") return typeof node.value === "string";
    if (node.type === "ArrayExpression")
      return node.elements.every((item) => !!item && staticPath(item, seen));
    if (
      node.type === "Identifier" &&
      !seen.has(node.name) &&
      !writes.has(node.name)
    ) {
      seen.add(node.name);
      const value = variables.get(node.name)?.init;
      return !!value && staticPath(value, seen);
    }
    return false;
  }
  // State shared with a remote operation must not be duplicated in a local
  // module instance. Expand the boundary before generating either router.
  let changed = true;
  while (changed) {
    changed = false;
    for (const entries of registrations.values())
      for (const { call } of entries) {
        if (!server(call.arguments)) continue;
        for (const name of closure(call.arguments))
          if (
            mutable.has(name) &&
            !routerNodes.has(name) &&
            !remoteState.has(name)
          ) {
            remoteState.add(name);
            changed = true;
          }
      }
  }
  const localRoots: Node[] = [];
  const selectorRoots: Node[] = [];
  const localRegistrations = new Map<Node, string[]>();
  const selectorRegistrations = new Map<Node, string[]>();
  const routes: D1Compilation["routes"] = [];
  let remoteErrors = false;
  const emit = (map: Map<Node, string[]>, statement: Node, code: string) =>
    map.set(statement, [...(map.get(statement) ?? []), code]);
  for (const [statement, items] of registrations)
    for (const { router, call } of items) {
      const method = property(call.callee);
      if (!method) fail("computed registration methods are not supported");
      if (method === "route" || method === "basePath") {
        // basePath returns a new router and needs alias ownership, not an ignored call.
        if (method === "basePath")
          fail(
            "basePath requires router alias analysis; mounted route() routers are supported",
          );
        const [path, child] = call.arguments;
        if (
          call.arguments.length !== 2 ||
          !path ||
          !staticPath(path) ||
          child?.type !== "Identifier"
        )
          fail("route() requires a static mount path and router");
        const mounted = rootRouter(child.name);
        localRoots.push(path);
        selectorRoots.push(path);
        emit(
          localRegistrations,
          statement,
          `${router}.route(${text(path)}, ${mounted});`,
        );
        emit(
          selectorRegistrations,
          statement,
          `${router}.route(${text(path)}, ${mounted});`,
        );
        continue;
      }
      if (method === "onError" || method === "notFound") {
        const remote = server(call.arguments);
        remoteErrors ||= remote;
        if (!remote) {
          localRoots.push(...call.arguments);
          emit(
            localRegistrations,
            statement,
            `${router}.${method}(${call.arguments.map(text).join(",")});`,
          );
        }
        continue;
      }
      if (!routeMethods.has(method))
        fail(`router operation ${method} needs execution analysis`);
      const pathCount =
        method === "on"
          ? 2
          : method === "use" &&
              call.arguments[0] &&
              !staticPath(call.arguments[0])
            ? 0
            : 1;
      const paths = call.arguments.slice(0, pathCount);
      const handlers = call.arguments.slice(pathCount);
      if (!handlers.length || paths.some((path) => !staticPath(path)))
        fail(
          `dynamic path/method for ${router}.${method} cannot be matched before execution`,
        );
      const remote = server(handlers);
      localRoots.push(...paths);
      if (!remote) localRoots.push(...handlers);
      selectorRoots.push(...paths);
      routes.push({
        router,
        method,
        path: paths.map(text).join(",") || "*",
        remote,
      });
      const prefix = paths.length ? paths.map(text).join(",") + "," : "";
      // Every candidate is visited, so a fallthrough to a server handler is selected
      // before local middleware, even when an earlier candidate could have responded.
      const marker = `async (c,next) => { ${remote ? 'c.set("__cwRemote",true);' : ""} await next(); if(c.get("__cwRemote"))c.header("x-cw-remote","1"); }`;
      emit(
        selectorRegistrations,
        statement,
        `${router}.${method}(${prefix}${marker});`,
      );
      emit(
        localRegistrations,
        statement,
        `${router}.${method}(${prefix}${remote ? '() => { throw new Error("Server route reached local dispatch"); }' : handlers.map(text).join(",")});`,
      );
    }
  const needed = closure(localRoots);
  const selectorNeeded = closure(selectorRoots);
  // All constructors are needed in both graphs. The selector has no user handlers.
  for (const name of constructors) {
    needed.add(name);
    selectorNeeded.add(name);
  }
  function generate(roots: Set<string>, calls: Map<Node, string[]>) {
    const included = new Set(
      [...roots].map((name) => declarations.get(name)).filter(Boolean),
    );
    const lines: string[] = [];
    for (const statement of program.body) {
      const router = [...routerNodes].find(
        ([, node]) => node === statement,
      )?.[0];
      if (router) lines.push(routerInitializers.get(router)!);
      else if (
        included.has(statement) &&
        statement.type !== "ExportNamedDeclaration"
      )
        lines.push(text(statement));
      lines.push(...(calls.get(statement) ?? []));
    }
    return lines.join("\n");
  }
  const hasRemote = remoteErrors || routes.some((route) => route.remote);
  if (remoteErrors)
    fail("D1-backed error/not-found handling can apply to every request");
  return {
    mode: "routes",
    local: generate(needed, localRegistrations) + `\nexport default ${root};\n`,
    selector:
      generate(selectorNeeded, selectorRegistrations) +
      `\nexport async function needsRemote(request) { ${remoteErrors ? "return true;" : `const response = await ${root}.fetch(new Request(request.url, {method: request.method})); if(response.status >= 500) throw new Error("Remote route selection failed"); return response.headers.get("x-cw-remote") === "1";`} }\n`,
    inputs,
    routes: hasRemote ? routes : [],
  };
}
