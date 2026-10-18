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

export interface ServerBuildOptions {
  /** Existing Wrangler JSON, JSONC or TOML configuration. Auto-detected in the build root. */
  workerConfig?: string;
  /** Binding names when configuration is supplied by another tool. No route annotations. */
  d1Bindings?: string[];
  /** Hyperdrive binding names when configuration is supplied by another tool. */
  hyperdriveBindings?: string[];
  r2Bindings?: string[];
  /** KV names when configuration is supplied by another tool. */
  kvBindings?: string[];
  /** Required execution policy for every configured KV binding. */
  kvExecution?: Record<string, "local" | "remote">;
  serviceBindings?: string[];
  queueBindings?: string[];
  /** Names explicitly supplied through workersCapacitor({ env }); other env access stays on the server. */
  localBindings?: string[];
}
export interface ServerCompilation {
  mode: "routes" | "worker";
  reason?: string;
  local: string;
  selector: string;
  inputs: string[];
  routes: { router: string; method: string; path: string; remote: boolean }[];
}
class WiderServerBoundary extends Error {}
export async function serverBindings(
  root: string,
  options: ServerBuildOptions,
) {
  for (const key of [
    "d1Bindings",
    "hyperdriveBindings",
    "r2Bindings",
    "kvBindings",
    "serviceBindings",
    "queueBindings",
    "localBindings",
  ] as const) {
    const values = options[key];
    if (
      values !== undefined &&
      (!Array.isArray(values) ||
        values.some((name) => typeof name !== "string" || !name.trim()))
    )
      throw new TypeError(`${key} must contain nonempty binding names`);
  }
  const file = options.workerConfig
    ? resolve(root, options.workerConfig)
    : ["wrangler.jsonc", "wrangler.json", "wrangler.toml"]
        .map((name) => resolve(root, name))
        .find(existsSync);
  let config: Record<string, unknown> = {};
  if (file) {
    const source = await readFile(file, "utf8");
    const errors: ParseError[] = [];
    config = file.endsWith(".toml")
      ? parseTOML(source)
      : parseJSON(source, errors, { allowTrailingComma: true });
    if (
      errors.length ||
      !config ||
      typeof config !== "object" ||
      Array.isArray(config)
    )
      throw new Error(`Invalid Worker configuration: ${file}`);
  }
  const env = config.env === undefined ? {} : config.env;
  if (!env || typeof env !== "object" || Array.isArray(env))
    throw new Error(`Invalid Worker environments in ${file}`);
  const environments = [config, ...Object.values(env)];
  if (
    environments.some(
      (value) => !value || typeof value !== "object" || Array.isArray(value),
    )
  )
    throw new Error(`Invalid Worker environments in ${file}`);
  function configured(key: string, child?: string) {
    const groups = environments.map((environment) => {
      let value = environment[key];
      if (child && value !== undefined) {
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw new Error(`Invalid ${key} in ${file}`);
        value = value[child];
      }
      return value === undefined ? [] : value;
    });
    if (
      groups.some(
        (bindings) =>
          !Array.isArray(bindings) ||
          bindings.some(
            (item: { binding?: unknown } | null) =>
              typeof item?.binding !== "string" || !item.binding.trim(),
          ),
      )
    )
      throw new Error(`Invalid ${key}${child ? "." + child : ""} in ${file}`);
    return groups.flat().map((item: { binding: string }) => item.binding);
  }
  // Each explicit list overrides only its own kind, without suppressing others.
  const d1 = options.d1Bindings ?? configured("d1_databases");
  const hyperdrive = options.hyperdriveBindings ?? configured("hyperdrive");
  const r2 = options.r2Bindings ?? configured("r2_buckets");
  const kv = options.kvBindings ?? configured("kv_namespaces");
  const policies = options.kvExecution === undefined ? {} : options.kvExecution;
  if (!policies || typeof policies !== "object" || Array.isArray(policies))
    throw new TypeError(
      "kvExecution must map binding names to local or remote",
    );
  for (const [name, policy] of Object.entries(policies)) {
    if (!kv.includes(name))
      throw new Error(`Unknown KV binding in kvExecution: ${name}`);
    if (policy !== "local" && policy !== "remote")
      throw new TypeError(`kvExecution.${name} must be local or remote`);
  }
  for (const name of kv)
    if (!Object.hasOwn(policies, name))
      throw new Error(`Set kvExecution.${name} to local or remote`);
  const services = options.serviceBindings ?? configured("services");
  const queues = options.queueBindings ?? configured("queues", "producers");
  const consumers = environments.flatMap((environment) => {
    const queues = environment.queues;
    if (queues === undefined) return [];
    if (!queues || typeof queues !== "object" || Array.isArray(queues))
      throw new Error(`Invalid queues in ${file}`);
    const consumers = queues.consumers === undefined ? [] : queues.consumers;
    if (
      !Array.isArray(consumers) ||
      consumers.some(
        (item) => typeof item?.queue !== "string" || !item.queue.trim(),
      )
    )
      throw new Error(`Invalid queues.consumers in ${file}`);
    return consumers;
  });
  const remoteKV = kv.filter((name) => policies[name] === "remote");
  const serverOnly = [
    ...d1,
    ...hyperdrive,
    ...r2,
    ...services,
    ...queues,
    ...remoteKV,
  ];
  if (options.localBindings?.some((name) => serverOnly.includes(name)))
    throw new Error("A server binding cannot also be a local binding");
  // Local KV does not require a network boundary. If another binding selects the
  // request for remote execution, the original Worker uses its cloud KV there.
  const localKV = kv.filter(
    (name) => policies[name] === "local" && !serverOnly.includes(name),
  );
  return {
    names: [...new Set<string>(serverOnly)],
    localBindings: [...new Set([...(options.localBindings ?? []), ...localKV])],
    kvBindings: localKV,
    config: file,
    forceRemoteReason: consumers.length
      ? "Queue consumers execute only on the deployed Worker"
      : undefined,
    reportFile:
      consumers.length ||
      hyperdrive.length ||
      r2.length ||
      remoteKV.length ||
      services.length ||
      queues.length
        ? "workers-capacitor-server.json"
        : "workers-capacitor-d1.json",
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
export async function compileServerWorker(
  entry: string,
  bindings: string[],
  options: Pick<
    BuildOptions,
    "alias" | "tsconfig" | "define" | "conditions"
  > & {
    localBindings?: string[];
    kvBindings?: string[];
    forceRemoteReason?: string;
  } = {},
): Promise<ServerCompilation> {
  const {
    localBindings = [],
    kvBindings = [],
    forceRemoteReason,
    ...buildOptions
  } = options;
  if (localBindings.some((name) => bindings.includes(name)))
    throw new Error("A server binding cannot also be a local binding");
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
    if (forceRemoteReason) throw new WiderServerBoundary(forceRemoteReason);
    return partition(source, bindings, inputs, localBindings, kvBindings);
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
  kvBindings: string[],
): ServerCompilation {
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
        declaration.init.type !== "Literal" ||
        "regex" in declaration.init
      )
        mutable.add(declaration.id.name);
    } else if (
      (statement.type === "FunctionDeclaration" ||
        statement.type === "ClassDeclaration") &&
      statement.id
    ) {
      if (statement.type === "ClassDeclaration")
        fail(
          "class initialization and static state require a single Worker boundary",
        );
      declarations.set(statement.id.name, statement);
      // Functions are objects too: properties can be mutated directly, through
      // aliases, or by Object.assign. Do not assume declaration syntax is immutable.
      mutable.add(statement.id.name);
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
  // Cookie state belongs to the deployed origin's session jar. A Worker that
  // touches it must not split login/logout/profile between two independent jars.
  // Likewise, ambient global state cannot be shared with a local module instance.
  const sharedGlobals = new Set([
    "globalThis",
    "global",
    "self",
    "window",
    "document",
    "process",
  ]);
  const headerMethods = new Set(["get", "has", "set", "append", "delete"]);
  const cookieName = (value: unknown) =>
    typeof value === "string" && /^(?:set-)?cookie2?$/i.test(value);
  function staticHeaderNames(node: Node): boolean {
    if (node.type === "ObjectExpression")
      return node.properties.every(
        (item) =>
          item.type === "Property" &&
          !item.computed &&
          (item.key.type === "Identifier" || item.key.type === "Literal"),
      );
    if (node.type === "ArrayExpression")
      return node.elements.every(
        (item) =>
          item?.type === "ArrayExpression" &&
          item.elements[0]?.type === "Literal" &&
          typeof item.elements[0].value === "string",
      );
    return false;
  }
  // Direct operations on a configured server/KV binding cannot be local Headers
  // operations. Aliases and other unknown receivers retain the conservative check.
  function serverBindingReceiver(node: Node): boolean {
    if (
      node.type !== "MemberExpression" ||
      ![...bindings, ...kvBindings].includes(property(node) ?? "")
    )
      return false;
    return (
      (node.object.type === "MemberExpression" &&
        property(node.object) === "env") ||
      (node.object.type === "Identifier" &&
        environmentImports.has(node.object.name))
    );
  }
  walk(program, (child, parent) => {
    if (
      child.type === "ImportDeclaration" &&
      child.source.value === "hono/cookie"
    )
      fail("cookie helpers require a single Worker session boundary");
    if (child.type === "Identifier" && sharedGlobals.has(child.name))
      fail("ambient global state requires a single Worker boundary");
    if (
      (child.type === "Literal" && cookieName(child.value)) ||
      (child.type === "Identifier" && cookieName(child.name))
    )
      fail(
        "Cookie and Set-Cookie access require a single Worker session boundary",
      );
    if (
      child.type === "MemberExpression" &&
      (property(child) === "header" ||
        headerMethods.has(property(child) ?? "")) &&
      !(parent?.type === "CallExpression" && parent.callee === child)
    )
      fail(
        "escaped header or collection methods may access Cookie session state",
      );
    if (
      child.type === "Identifier" &&
      child.name === "Headers" &&
      !(parent?.type === "NewExpression" && parent.callee === child)
    )
      fail("an escaped Headers constructor may access Cookie session state");
    if (
      child.type === "MemberExpression" &&
      property(child) === "headers" &&
      !(
        parent?.type === "MemberExpression" &&
        parent.object === child &&
        headerMethods.has(property(parent) ?? "")
      )
    )
      fail("an escaped header collection may contain Cookie session state");
    if (
      child.type === "Property" &&
      !child.computed &&
      (child.key.type === "Identifier"
        ? child.key.name
        : child.key.type === "Literal"
          ? child.key.value
          : undefined) === "headers" &&
      !staticHeaderNames(child.value)
    )
      fail("dynamic header collections may contain Cookie session state");
    if (
      child.type === "NewExpression" &&
      child.callee.type === "Identifier" &&
      child.callee.name === "Headers" &&
      child.arguments.length &&
      !staticHeaderNames(child.arguments[0])
    )
      fail("dynamic Headers initialization may contain Cookie session state");
    if (
      child.type === "CallExpression" &&
      child.callee.type === "MemberExpression"
    ) {
      const method = property(child.callee);
      // An aliased Headers receiver is indistinguishable from another collection
      // here. Unknown collection keys therefore widen the boundary conservatively.
      if (
        (method === "header" || headerMethods.has(method ?? "")) &&
        !serverBindingReceiver(child.callee.object) &&
        (child.arguments[0]?.type !== "Literal" ||
          typeof child.arguments[0].value !== "string")
      )
        fail(
          "dynamic header or collection access may contain Cookie session state",
        );
    }
  });
  walk(program, (child) => {
    if (
      child.type !== "AssignmentExpression" &&
      child.type !== "UpdateExpression"
    )
      return;
    let target: Node =
      child.type === "AssignmentExpression" ? child.left : child.argument;
    while (target.type === "MemberExpression") target = target.object;
    if (target.type === "Identifier" && declarations.has(target.name)) {
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
  // Removing an unused declaration is safe only when its initializer cannot
  // execute application code. This intentionally excludes calls, property reads,
  // spreads, computed keys and classes; preserving those in two graphs is unsafe.
  function pureInitializer(node: Node): boolean {
    switch (node.type) {
      case "Literal":
      case "Identifier":
      case "ArrowFunctionExpression":
      case "FunctionExpression":
        return true;
      case "ArrayExpression":
        return node.elements.every((value) => !value || pureInitializer(value));
      case "ObjectExpression":
        return node.properties.every(
          (value) =>
            value.type === "Property" &&
            !value.computed &&
            value.kind === "init" &&
            pureInitializer(value.value),
        );
      case "UnaryExpression":
        return node.operator !== "delete" && node.argument.type === "Literal";
      default:
        return false;
    }
  }
  for (const [name, declaration] of variables) {
    if (
      !routerNodes.has(name) &&
      declaration.init &&
      !pureInitializer(declaration.init)
    )
      fail(
        `initializer for ${name} may execute application code before dispatch`,
      );
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
  function rejectRouterEscape(nodes: Node[]) {
    if ([...closure(nodes)].some((name) => routerNodes.has(name)))
      fail(
        "router references inside application handlers require a single Worker boundary",
      );
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
            if (
              declarations.get(name)?.type === "FunctionDeclaration" &&
              writes.has(name)
            )
              fail(
                `function object ${name} may share state across the Worker boundary`,
              );
            remoteState.add(name);
            changed = true;
          }
      }
  }
  const localRoots: Node[] = [];
  const selectorRoots: Node[] = [];
  const localRegistrations = new Map<Node, string[]>();
  const selectorRegistrations = new Map<Node, string[]>();
  const routes: ServerCompilation["routes"] = [];
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
        rejectRouterEscape(call.arguments);
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
      rejectRouterEscape(handlers);
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
    fail("Server-backed error/not-found handling can apply to every request");
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
