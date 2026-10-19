import { dirname, resolve } from "node:path";
import { build, type BuildOptions } from "esbuild";
import { parseAst } from "rollup/parseAst";
import { transformAsync, type types } from "@babel/core";
import type {
  Node,
  Expression,
  CallExpression,
  VariableDeclarator,
} from "estree";

export {
  serverBindings,
  type ServerBuildOptions,
  type WorkerExecution,
  type WorkerExecutionMode,
  type LocalRoute,
} from "../cloudflare/bindings/config.js";

import type {
  ServerBuildOptions,
  LocalRoute,
} from "../cloudflare/bindings/config.js";

export interface ServerCompilation {
  mode: "routes" | "worker";
  reason?: string;
  local: string;
  selector: string;
  inputs: string[];
  routes: {
    router: string;
    method: string;
    path: string;
    remote: boolean;
    reason: string;
  }[];
}
class WiderServerBoundary extends Error {}

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
    execution?: ServerBuildOptions["execution"];
    localBindings?: string[];
    kvBindings?: string[];
    forceRemoteReason?: string;
  } = {},
): Promise<ServerCompilation> {
  const {
    execution = "network",
    localBindings = [],
    kvBindings = [],
    forceRemoteReason,
    ...buildOptions
  } = options;
  if (
    execution !== "network" &&
    execution !== "local" &&
    !Array.isArray(execution)
  )
    throw new TypeError(
      'execution must be "network", "local", or an array of route permissions',
    );
  if (
    Array.isArray(execution) &&
    execution.some(
      (route) =>
        !route ||
        !/^(\*|GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(route.method) ||
        !(typeof route.path === "string"
          ? route.path === "*" || route.path.startsWith("/")
          : route.path instanceof RegExp),
    )
  )
    throw new TypeError(
      'execution routes require an uppercase HTTP method or "*" and a Hono registration path or RegExp',
    );
  if (execution === "local" && (bindings.length || forceRemoteReason))
    throw new Error(
      "local execution cannot use configured server bindings or server-only events; use network or route permissions",
    );
  if (localBindings.some((name) => bindings.includes(name)))
    throw new Error("A server binding cannot also be a local binding");
  if (execution === "local")
    return {
      mode: "worker",
      reason: "Entire Worker distribution explicitly permitted",
      // Keep the host bundler's loaders, aliases and transforms for full local execution.
      local: `export { default } from ${JSON.stringify(entry.replaceAll("\\", "/"))};`,
      selector: "export function needsRemote() { return false; }",
      inputs: [],
      routes: [
        {
          router: "worker",
          method: "all",
          path: "*",
          remote: false,
          reason:
            "Entire Worker distribution explicitly permitted; runtime compatibility is the application's responsibility",
        },
      ],
    };
  const bundled = await build({
    ...buildOptions,
    absWorkingDir: dirname(entry),
    entryPoints: [entry],
    bundle: true,
    packages: "external",
    // Remote-only applications may import Cloudflare WASM modules and binary
    // assets (for example next/og). Keep these files in the dependency graph
    // for the client-import guard, without embedding unused server data.
    loader:
      forceRemoteReason || execution === "network"
        ? { ".wasm": "empty", ".bin": "empty" }
        : undefined,
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
    if (execution === "network")
      throw new WiderServerBoundary("Network execution explicitly selected");
    if (forceRemoteReason) throw new WiderServerBoundary(forceRemoteReason);
    return await partition(
      source,
      bindings,
      inputs,
      localBindings,
      kvBindings,
      execution as readonly LocalRoute[],
    );
  } catch (error) {
    if (!(error instanceof WiderServerBoundary)) throw error;
    return {
      mode: "worker",
      reason: error.message,
      inputs,
      local:
        'export default { fetch() { throw new Error("Server-only Worker reached local dispatch"); } };',
      selector: "export function needsRemote() { return true; }",
      routes: [
        {
          router: "worker",
          method: "all",
          path: "*",
          remote: true,
          reason: error.message,
        },
      ],
    };
  }
}
// A missing server binding is not proof of a local dependency. Resolve lexical
// bindings with Babel (already used by the build), including shadowed parameters.
// Network, process, caches and unknown host globals deliberately have no local
// contract here. Request dispatch stays on the server when they are referenced.
async function unresolvedReferences(source: string) {
  const globals = new Set([
    "undefined",
    "NaN",
    "Infinity",
    "JSON",
    "String",
    "Number",
    "Boolean",
    "BigInt",
    "Array",
    "Object",
    "Math",
    "URL",
    "URLSearchParams",
    "TextEncoder",
    "TextDecoder",
    "Response",
    "Request",
    "Headers",
    "Promise",
    "RegExp",
    "Error",
    "TypeError",
    "RangeError",
  ]);
  const staticCalls: Record<string, string[]> = {
    JSON: ["parse", "stringify"],
    Math: [
      "abs",
      "ceil",
      "floor",
      "round",
      "trunc",
      "min",
      "max",
      "pow",
      "sqrt",
      "sign",
      "random",
    ],
    Number: [
      "isFinite",
      "isInteger",
      "isNaN",
      "isSafeInteger",
      "parseFloat",
      "parseInt",
    ],
    String: ["fromCharCode", "fromCodePoint", "raw"],
    Array: ["isArray", "from", "of"],
    Object: ["is"],
    Promise: ["resolve", "reject", "all", "allSettled", "race", "any"],
    Response: ["json", "redirect", "error"],
    URL: ["canParse", "parse"],
  };
  const staticValues: Record<string, string[]> = {
    Math: ["E", "LN2", "LN10", "LOG2E", "LOG10E", "PI", "SQRT1_2", "SQRT2"],
    Number: [
      "EPSILON",
      "MAX_SAFE_INTEGER",
      "MIN_SAFE_INTEGER",
      "MAX_VALUE",
      "MIN_VALUE",
      "NaN",
      "NEGATIVE_INFINITY",
      "POSITIVE_INFINITY",
    ],
  };
  const unresolved = new Set<number>();
  const references = new Map<number, string>();
  await transformAsync(source, {
    configFile: false,
    babelrc: false,
    sourceType: "module",
    code: false,
    ast: false,
    plugins: [
      () => ({
        visitor: {
          ThisExpression(path) {
            unresolved.add(path.node.start!);
          },
          ObjectPattern(path) {
            if (
              path.node.properties.some(
                (property) =>
                  property.type === "ObjectProperty" &&
                  (property.computed ||
                    (property.key.type === "Identifier" &&
                      ["constructor", "__proto__"].includes(
                        property.key.name,
                      )) ||
                    (property.key.type === "StringLiteral" &&
                      ["constructor", "__proto__"].includes(
                        property.key.value,
                      ))),
              )
            )
              throw new WiderServerBoundary(
                "Dynamic runtime access requires a single Worker boundary",
              );
            unresolved.add(path.node.start!);
          },
          SpreadElement(path) {
            unresolved.add(path.node.start!);
          },
          MetaProperty(path) {
            unresolved.add(path.node.start!);
          },
          AssignmentExpression(path) {
            let target: types.Node = path.node.left;
            while (target.type === "MemberExpression") target = target.object;
            if (
              target.type !== "Identifier" ||
              !path.scope.getBinding(target.name)
            )
              throw new WiderServerBoundary(
                "Writes to ambient state require a single Worker boundary",
              );
          },
          UpdateExpression(path) {
            let target: types.Node = path.node.argument;
            while (target.type === "MemberExpression") target = target.object;
            if (
              target.type !== "Identifier" ||
              !path.scope.getBinding(target.name)
            )
              throw new WiderServerBoundary(
                "Writes to ambient state require a single Worker boundary",
              );
          },
          ReferencedIdentifier(path) {
            const name = path.node.name;
            const binding = path.scope.getBinding(name);
            if (!binding || binding.scope.path.isProgram())
              references.set(path.node.start!, name);
            if (binding) {
              if (binding.kind === "module") {
                const declaration = binding.path.parentPath;
                if (
                  declaration?.isImportDeclaration() &&
                  [
                    "hono",
                    "hono/html",
                    "hono/jsx",
                    "hono/jsx/jsx-runtime",
                  ].includes(declaration.node.source.value)
                ) {
                  const use = path.parentPath;
                  if (
                    !(
                      ((use.isCallExpression() || use.isNewExpression()) &&
                        use.node.callee === path.node) ||
                      (use.isTaggedTemplateExpression() &&
                        use.node.tag === path.node)
                    )
                  )
                    throw new WiderServerBoundary(
                      "Escaped rendering import requires a single Worker boundary",
                    );
                }
              }
              return;
            }
            if (["eval", "Function", "Reflect", "Proxy"].includes(name))
              throw new WiderServerBoundary(
                "Dynamic runtime access requires a single Worker boundary",
              );
            if (!globals.has(name)) {
              unresolved.add(path.node.start!);
              return;
            }
            if (["undefined", "NaN", "Infinity"].includes(name)) return;
            const parent = path.parentPath;
            if (
              (parent.isCallExpression() || parent.isNewExpression()) &&
              parent.node.callee === path.node &&
              !["Math", "JSON"].includes(name)
            )
              return;
            if (
              parent.isMemberExpression() &&
              parent.node.object === path.node
            ) {
              const key =
                !parent.node.computed &&
                parent.node.property.type === "Identifier"
                  ? parent.node.property.name
                  : parent.node.computed &&
                      parent.node.property.type === "StringLiteral"
                    ? parent.node.property.value
                    : undefined;
              if (key && staticValues[name]?.includes(key)) return;
              const use = parent.parentPath;
              if (
                key &&
                staticCalls[name]?.includes(key) &&
                use.isCallExpression() &&
                use.node.callee === parent.node
              )
                return;
            }
            // Do not chase aliases, reflection or arbitrary mutation of host objects.
            throw new WiderServerBoundary(
              "Escaped or unsupported use of a standard global requires a single Worker boundary",
            );
          },
        },
      }),
    ],
  });
  return { unresolved, references };
}
async function partition(
  source: string,
  bindings: string[],
  inputs: string[],
  localBindings: string[],
  kvBindings: string[],
  routePermissions: readonly LocalRoute[],
): Promise<ServerCompilation> {
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
          !["hono", "hono/html", "hono/jsx", "hono/jsx/jsx-runtime"].includes(
            statement.source.value,
          )
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
        if (
          !/^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/?)?$/.test(
            call.arguments[0].value,
          )
        )
          fail(
            "Patterned basePath requires a single Worker distribution boundary",
          );
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
  const { unresolved, references } = await unresolvedReferences(source);
  function dependencies(node: Node) {
    const result = new Set<string>();
    walk(node, (child) => {
      const name = references.get((child as Node & { start: number }).start);
      if (name) result.add(name);
    });
    return result;
  }
  function closure(nodes: Node[]) {
    const result = new Set(nodes.flatMap((node) => [...dependencies(node)]));
    for (const name of result) {
      const declaration = declarations.get(name);
      if (declaration && !routerNodes.has(name))
        for (const dependency of dependencies(declaration))
          result.add(dependency);
      for (const value of writes.get(name) ?? [])
        for (const dependency of dependencies(value)) result.add(dependency);
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
    let remote = [...dependencies].some(
      (name) =>
        bindings.includes(name) ||
        environmentImports.has(name) ||
        opaqueImports.has(name) ||
        remoteState.has(name),
    );
    // A server-only handler can still affect other routes through runtime state.
    // Always check whole-Worker boundaries, even after finding a remote binding.
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
        if (unresolved.has((child as Node & { start: number }).start))
          remote = true;
        const key = property(child);
        if (key && bindings.includes(key)) remote = true;
        if (key === "constructor" || key === "__proto__")
          fail("Dynamic runtime access requires a single Worker boundary");
        if (["executionCtx", "event", "cf"].includes(key ?? "")) remote = true;
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
          fail("Dynamic property access requires a single Worker boundary");
        if (
          child.type === "ImportExpression" ||
          (child.type === "Identifier" &&
            ["eval", "Function", "Reflect", "Proxy"].includes(child.name))
        )
          remote = true;
      });
    return remote;
  }
  // Middleware has no independent distribution grant. Only an unconditional
  // await next() can accompany a permitted route without changing authority.
  function passthroughMiddleware(node: Node, seen = new Set<Node>()): boolean {
    if (seen.has(node)) return false;
    seen.add(node);
    if (node.type === "Identifier") {
      const value =
        variables.get(node.name)?.init ?? declarations.get(node.name);
      return !!value && passthroughMiddleware(value, seen);
    }
    if (
      ![
        "ArrowFunctionExpression",
        "FunctionExpression",
        "FunctionDeclaration",
      ].includes(node.type)
    )
      return false;
    const fn = node as import("estree").Function;
    if (
      fn.params.length !== 2 ||
      fn.params.some((p) => p.type !== "Identifier") ||
      fn.body.type !== "BlockStatement" ||
      fn.body.body.length !== 1
    )
      return false;
    const statement = fn.body.body[0]!;
    return (
      statement.type === "ExpressionStatement" &&
      statement.expression.type === "AwaitExpression" &&
      statement.expression.argument.type === "CallExpression" &&
      statement.expression.argument.callee.type === "Identifier" &&
      statement.expression.argument.callee.name ===
        (fn.params[1] as import("estree").Identifier).name &&
      statement.expression.argument.arguments.length === 0
    );
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
  const granted = new Set<CallExpression>();
  // Do not guess effective paths through mounts or aliases. They remain remote.
  const entries = [...registrations.values()].flat();
  for (const route of routePermissions) {
    // Copy stateful expressions so each registration and rebuild is independent.
    const pattern =
      route.path instanceof RegExp
        ? new RegExp(route.path.source, route.path.flags)
        : undefined;
    const matchesPath = (path: string | undefined) => {
      if (path === undefined) return false;
      if (typeof route.path === "string") {
        if (path === route.path || route.path === "*" || route.path === "/*")
          return true;
        // Hono's trailing wildcard includes the base path. Only a literal
        // prefix proves containment of another registration's entire pattern.
        if (
          route.path.endsWith("/*") &&
          !/[:*{}?]/.test(route.path.slice(0, -2))
        ) {
          const base = route.path.slice(0, -2);
          return path === base || path.startsWith(`${base}/`);
        }
        return false;
      }
      if (!pattern) return false;
      pattern.lastIndex = 0;
      return pattern.test(path);
    };
    const matches = entries.filter(
      ({ router, call }) =>
        router === root &&
        !routerInitializers.get(root)?.includes(".basePath(") &&
        (route.method === "*"
          ? /^(get|head|post|put|patch|delete|options|all)$/.test(
              property(call.callee) ?? "",
            )
          : property(call.callee) === route.method.toLowerCase()) &&
        matchesPath(literal(call.arguments[0])),
    );
    if (!matches.length)
      throw new Error(
        `execution: cannot resolve ${route.method} ${route.path} to a direct Hono registration`,
      );
    for (const match of matches) granted.add(match.call);
  }
  function distributionAllowed(call: CallExpression, handlers: Node[]) {
    if (property(call.callee) !== "use") return granted.has(call);
    return handlers.every(
      (argument) => staticPath(argument) || passthroughMiddleware(argument),
    );
  }
  // State shared with a remote operation must not be duplicated in a local
  // module instance. Expand the boundary before generating either router.
  let changed = true;
  while (changed) {
    changed = false;
    for (const entries of registrations.values())
      for (const { call } of entries) {
        if (
          !server(call.arguments) &&
          distributionAllowed(call, call.arguments)
        )
          continue;
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
  const candidates = [...registrations.values()]
    .flat()
    .filter(({ call }) => routeMethods.has(property(call.callee) ?? ""))
    .sort(
      (a, b) =>
        (a.call as CallExpression & { end: number }).end -
        (b.call as CallExpression & { end: number }).end,
    )
    .map((entry) => {
      const method = property(entry.call.callee)!;
      const pathCount =
        method === "on"
          ? 2
          : method === "use" &&
              entry.call.arguments[0] &&
              !staticPath(entry.call.arguments[0])
            ? 0
            : 1;
      const paths = entry.call.arguments.slice(0, pathCount);
      const handlers = entry.call.arguments.slice(pathCount);
      return {
        ...entry,
        method,
        paths: method === "on" ? paths.slice(1) : paths,
        handlers,
        remote: server(handlers) || !distributionAllowed(entry.call, handlers),
      };
    });
  function literal(node: Node | undefined): string | undefined {
    if (node?.type === "Identifier")
      return literal(variables.get(node.name)?.init ?? undefined);
    return node?.type === "Literal" && typeof node.value === "string"
      ? node.value
      : undefined;
  }
  function disjoint(a: string | undefined, b: string | undefined): boolean {
    if (a === undefined || b === undefined) return false;
    const plain = (path: string) =>
      path.startsWith("/") && !/[:*{}?]/.test(path) && !path.includes("//");
    if (plain(a) && plain(b))
      return a.replace(/\/$/, "") !== b.replace(/\/$/, "");
    const prefix = (path: string) =>
      (path.match(/^\/[^:*{}?]*/)?.[0] ?? "")
        .split("//")[0]!
        .replace(/\/$/, "");
    const ap = prefix(a),
      bp = prefix(b);
    return (
      (plain(a) && !a.startsWith(bp)) ||
      (plain(b) && !b.startsWith(ap)) ||
      (!ap.startsWith(bp) && !bp.startsWith(ap))
    );
  }
  function rootOutsideMount(
    a: (typeof candidates)[number],
    b: (typeof candidates)[number],
  ) {
    if (a.router !== root || literal(a.paths[0]) !== "/") return false;
    const mounts = [...registrations.values()]
      .flat()
      .filter(({ call }) => property(call.callee) === "route");
    return (
      mounts.length > 0 &&
      mounts.every(
        ({ router, call }) =>
          router === root &&
          call.arguments[1]?.type === "Identifier" &&
          rootRouter(call.arguments[1].name) === b.router &&
          /^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(
            literal(call.arguments[0]) ?? "",
          ),
      )
    );
  }

  // Remove protected handlers from the distribution graph, not merely from
  // request-time execution. Prefix checks only prove disjointness; uncertain
  // overlap widens the boundary instead of recreating Hono's router.
  const protectedCalls = new Set<CallExpression>();
  let widened = true;
  while (widened) {
    widened = false;
    for (let i = 0; i < candidates.length; i++)
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i]!,
          b = candidates[j]!;
        if (a.remote && b.remote) continue;
        // A proven passthrough registered before the server operation writes
        // its headers even to an unauthenticated response. A later middleware
        // can be protected by the earlier operation and must not be distributed.
        if (
          (!a.remote && a.method === "use") ||
          (!a.remote && !b.remote && b.method === "use")
        )
          continue;
        if (
          !["all", "on", "use"].includes(a.method) &&
          !["all", "on", "use"].includes(b.method) &&
          a.method !== b.method &&
          ![a.method, b.method].every((method) =>
            ["get", "head"].includes(method),
          )
        )
          continue;
        if (a.router !== b.router) {
          if (rootOutsideMount(a, b) || rootOutsideMount(b, a)) continue;
          fail(
            "Mounted route overlap requires a single Worker distribution boundary",
          );
        }
        if (disjoint(literal(a.paths[0]), literal(b.paths[0]))) continue;
        if (!a.remote && !b.remote)
          fail(
            "Overlapping local responses require a single Worker distribution boundary",
          );
        if (!a.remote) protectedCalls.add(a.call);
        if (!b.remote) protectedCalls.add(b.call);
        a.remote = b.remote = true;
        widened = true;
      }
  }
  const distributionRemote = new Map(
    candidates.map(({ call, remote }) => [call, remote]),
  );
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
        remoteErrors = true;
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
      const remote = distributionRemote.get(call)!;
      localRoots.push(...paths);
      if (!remote) localRoots.push(...handlers);
      selectorRoots.push(...paths);
      routes.push({
        router,
        method,
        path: paths.map(text).join(",") || "*",
        remote,
        reason: protectedCalls.has(call)
          ? "Protected by an overlapping server handler or middleware; implementation is not distributed"
          : remote
            ? !granted.has(call)
              ? "Route distribution was not permitted by execution"
              : "Server dependency or dependency without a local execution contract or public rendering contract"
            : granted.has(call)
              ? "Route and retained dependencies explicitly permitted for distribution; no overlapping server boundary"
              : "Passthrough middleware with no overlapping server boundary",
      });
      const prefix = paths.length ? paths.map(text).join(",") + "," : "";
      // Every candidate is visited, so a fallthrough to a server handler is selected
      // before local middleware, even when an earlier candidate could have responded.
      const marker = `async (c,next) => { ${remote ? 'c.set("__cwRemote",true);' : ""} await next(); ${granted.has(call) ? 'c.header("x-cw-local-route","1");' : ""} if(c.get("__cwRemote"))c.header("x-cw-remote","1"); }`;
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
  if (remoteErrors)
    fail("Server-backed error/not-found handling can apply to every request");
  return {
    mode: "routes",
    local: generate(needed, localRegistrations) + `\nexport default ${root};\n`,
    selector:
      generate(selectorNeeded, selectorRegistrations) +
      `\nexport async function needsRemote(request) { ${remoteErrors ? "return true;" : `const response = await ${root}.fetch(new Request(request.url, {method: request.method})); if(response.status >= 500) throw new Error("Remote route selection failed"); return response.headers.get("x-cw-local-route") !== "1" || response.headers.get("x-cw-remote") === "1";`} }\n`,
    inputs,
    routes,
  };
}
