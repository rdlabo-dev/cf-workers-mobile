import { parseAst } from "rollup/parseAst";
import type { Node, Expression } from "estree";

type Positioned = Node & { start: number; end: number };
const position = (node: Node) => node as Positioned;
const identifier = (node: Node | null | undefined, name: string) =>
  node?.type === "Identifier" && node.name === name;
function literal(node: Node | null | undefined): string | undefined {
  return node?.type === "Literal" && typeof node.value === "string"
    ? node.value
    : undefined;
}
function fields(node: Node | null | undefined) {
  if (node?.type !== "ObjectExpression")
    throw new Error("Unknown generated options");
  return new Map(
    node.properties.map((property) => {
      if (
        property.type !== "Property" ||
        property.computed ||
        property.kind !== "init"
      )
        throw new Error("Unknown generated options");
      const key =
        property.key.type === "Identifier"
          ? property.key.name
          : literal(property.key);
      if (!key) throw new Error("Unknown generated option name");
      return [key, property.value as Expression] as const;
    }),
  );
}
function data(node: Node): unknown {
  if (node.type === "Literal") return node.value;
  if (node.type === "ArrayExpression")
    return node.elements.map((item) => {
      if (!item) throw new Error("Unknown generated array");
      return data(item);
    });
  if (node.type === "ObjectExpression")
    return Object.fromEntries(
      [...fields(node)].map(([key, value]) => [key, data(value)]),
    );
  throw new Error("Non-literal generated configuration");
}
function walk(
  node: Node,
  visit: (node: Node, parent?: Node) => void,
  parent?: Node,
) {
  visit(node, parent);
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child && typeof child === "object" && typeof child.type === "string")
        walk(child, visit, node);
    }
  }
}

/** React's guarded error reporter uses process.emit, not server environment data. */
export function usesServerProcess(source: string) {
  let unsafe = false;
  walk(parseAst(source), (node, parent) => {
    if (!identifier(node, "process")) return;
    if (parent?.type === "UnaryExpression" && parent.operator === "typeof")
      return;
    if (
      parent?.type === "MemberExpression" &&
      parent.object === node &&
      !parent.computed &&
      identifier(parent.property, "emit")
    )
      return;
    unsafe = true;
  });
  return unsafe;
}

export interface VoidRoute {
  path: string;
  method: string;
  module?: string;
  component?: string;
  renderMode?: "server" | "client";
}

/** Read only the pinned generator's literal registrations, never application source. */
export function readVoidPlan(source: string) {
  const start = source.indexOf("//#region virtual:void-routes\n");
  const end = source.indexOf("//#region .void/entry.ts\n", start);
  if (start < 0 || end < 0)
    throw new Error("Unknown Void generated routing entry");
  const program = parseAst(source);
  const declarations = new Map<string, Node>();
  const initializers = new Map<string, Expression>();
  for (const statement of program.body) {
    if (statement.type === "VariableDeclaration") {
      for (const declaration of statement.declarations) {
        if (declaration.id.type === "Identifier" && declaration.init) {
          declarations.set(declaration.id.name, statement);
          initializers.set(declaration.id.name, declaration.init);
        }
      }
    } else if (statement.type === "FunctionDeclaration" && statement.id) {
      declarations.set(statement.id.name, statement);
    } else if (statement.type === "ImportDeclaration") {
      for (const specifier of statement.specifiers)
        declarations.set(specifier.local.name, statement);
    }
  }
  if (
    initializers.get("__voidHeadConfig")?.type !== "Literal" ||
    (initializers.get("__voidHeadConfig") as { value?: unknown }).value !== null
  )
    throw new Error(
      "Void custom head configuration requires network execution",
    );
  if (fields(initializers.get("layoutTree")).size)
    throw new Error("Void layouts require network execution");
  const routing = initializers.get("__routingRuntime");
  if (
    routing?.type !== "CallExpression" ||
    !identifier(routing.callee, "createRoutingRuntime") ||
    !identifier(routing.arguments[0], "app")
  )
    throw new Error("Unknown Void routing runtime");
  const routingOptions = fields(routing.arguments[1]);
  if (
    [...routingOptions.keys()].some(
      (key) =>
        ![
          "dev",
          "nodeTarget",
          "managedDispatch",
          "blockedAssetExtensions",
        ].includes(key),
    ) ||
    ["dev", "nodeTarget", "managedDispatch"].some(
      (key) => data(routingOptions.get(key)!) !== false,
    )
  )
    throw new Error(
      "Void custom routing configuration requires network execution",
    );
  const components = fields(initializers.get("components"));
  const modulePath = (node: Node | undefined) => {
    if (
      node?.type !== "ArrowFunctionExpression" ||
      node.params.length ||
      node.body.type !== "ImportExpression"
    )
      throw new Error("Unknown Void module loader");
    const path = literal(node.body.source);
    if (
      !path?.startsWith("./assets/") ||
      !path.endsWith(".js") ||
      path.includes("..")
    )
      throw new Error("Unknown Void generated module path");
    return path;
  };
  const loader = (node: Node | undefined) => {
    if (!node) return;
    if (node.type !== "Identifier")
      throw new Error("Unknown Void loader reference");
    const value = initializers.get(node.name);
    if (
      value?.type !== "CallExpression" ||
      !identifier(value.callee, "createModuleLoader")
    )
      throw new Error("Unknown Void loader factory");
    return modulePath(value.arguments[0]);
  };
  const assetCall = initializers.get("getPagesAssetTags");
  if (
    assetCall?.type !== "CallExpression" ||
    !identifier(assetCall.callee, "createClientAssetTags")
  )
    throw new Error("Unknown Void client assets configuration");
  const assets = data(assetCall.arguments[0]);
  const routes: VoidRoute[] = [];
  for (const statement of program.body) {
    if (
      position(statement).start < start ||
      position(statement).start >= end ||
      statement.type !== "ExpressionStatement"
    )
      continue;
    const call = statement.expression;
    if (
      call.type !== "CallExpression" ||
      call.callee.type !== "MemberExpression" ||
      !identifier(call.callee.object, "app") ||
      call.callee.computed ||
      call.callee.property.type !== "Identifier"
    )
      throw new Error("Unknown Void routing side effect");
    const method = call.callee.property.name;
    if (method === "use") {
      const middleware = call.arguments[0];
      if (
        call.arguments.length !== 1 ||
        middleware?.type !== "MemberExpression" ||
        !identifier(middleware.object, "__routingRuntime") ||
        middleware.computed ||
        middleware.property.type !== "Identifier" ||
        !["contextMiddleware", "requestMiddleware"].includes(
          middleware.property.name,
        )
      )
        throw new Error(
          "Void application middleware requires network execution",
        );
      continue;
    }
    if (method === "onError") {
      const handler = call.arguments[0];
      if (
        call.arguments.length !== 1 ||
        handler?.type !== "MemberExpression" ||
        !identifier(handler.object, "__errorRenderer") ||
        !identifier(handler.property, "onError") ||
        handler.computed
      )
        throw new Error(
          "Void custom error handling requires network execution",
        );
      continue;
    }
    if (method === "notFound") {
      const handler = call.arguments[0];
      if (
        call.arguments.length !== 1 ||
        handler?.type !== "CallExpression" ||
        !identifier(handler.callee, "createPagesFallback")
      )
        throw new Error("Void custom fallback requires network execution");
      const fallback = fields(handler.arguments[0]);
      const rules = fallback.get("fallbackRules");
      if (
        rules &&
        !(rules.type === "UnaryExpression" && rules.operator === "void")
      )
        throw new Error("Void fallback rules require network execution");
      continue;
    }
    if (method === "all" && literal(call.arguments[0]) === "/__void/*")
      continue;
    const path = literal(call.arguments[method === "on" ? 1 : 0]);
    if (!path) throw new Error("Unknown Void route path");
    if (method === "on") {
      const methods = call.arguments[0];
      if (
        methods?.type !== "ArrayExpression" ||
        methods.elements.length !== 4 ||
        methods.elements.some(
          (item, index) =>
            literal(item) !== ["POST", "PUT", "PATCH", "DELETE"][index],
        ) ||
        call.arguments.length !== 3 ||
        call.arguments[2]?.type !== "CallExpression" ||
        !identifier(call.arguments[2].callee, "createPageMutationHandler")
      )
        throw new Error("Unknown Void mutation registration");
      routes.push({ path, method: "POST/PUT/PATCH/DELETE" });
      continue;
    }
    const factory = call.arguments[1];
    if (method !== "get" || factory?.type !== "CallExpression") {
      throw new Error("Unknown Void route registration");
    }
    if (call.arguments.length !== 2)
      throw new Error("Void route middleware requires network execution");
    if (
      identifier(factory.callee, "createHttpRouteHandler") &&
      literal(factory.arguments[1]) === "GET"
    ) {
      routes.push({
        path,
        method: "GET",
        module: loader(factory.arguments[0]),
      });
    } else if (identifier(factory.callee, "createPageGetHandler")) {
      const options = fields(factory.arguments[0]);
      if (
        [...options.keys()].some(
          (key) =>
            ![
              "load",
              "componentId",
              "render",
              "assets",
              "headConfig",
              "renderOptions",
            ].includes(key),
        ) ||
        !identifier(options.get("render"), "renderPage") ||
        !identifier(options.get("assets"), "getPagesAssetTags") ||
        !identifier(options.get("headConfig"), "__voidHeadConfig")
      )
        throw new Error("Unknown Void page configuration");
      const component = literal(options.get("componentId"));
      const renderOptions = fields(options.get("renderOptions"));
      const renderMode =
        renderOptions.size === 1
          ? literal(renderOptions.get("renderMode"))
          : undefined;
      if (
        !component ||
        !components.has(component) ||
        (renderMode !== "server" && renderMode !== "client")
      )
        throw new Error("Unknown Void page renderer");
      routes.push({
        path,
        method: "GET",
        module: loader(options.get("load")),
        component,
        renderMode,
      });
    } else throw new Error("Unknown Void route handler");
  }
  return {
    routes,
    assets,
    componentPath: (id: string) => modulePath(components.get(id)),
    renderer(ids: string[]) {
      const retained = new Set<Node>();
      const include = (name: string) => {
        const statement = declarations.get(name);
        if (!statement || retained.has(statement)) return;
        retained.add(statement);
        if (name === "components") return;
        walk(statement, (node) => {
          if (node.type === "Identifier") include(node.name);
        });
      };
      include("renderPage");
      if (!retained.size) throw new Error("Missing Void renderer");
      return (
        [...retained]
          .sort((a, b) => position(a).start - position(b).start)
          .map((node) =>
            node === declarations.get("components")
              ? `var components = {${ids.map((id) => `${JSON.stringify(id)}:()=>import(${JSON.stringify(modulePath(components.get(id)))})`).join(",")}};`
              : source.slice(position(node).start, position(node).end),
          )
          .join("\n") + "\nexport { renderPage };"
      );
    },
  };
}

export function voidSelector(paths: string[]) {
  return `export function needsRemote(request) {
    const url = new URL(request.url);
    return request.method !== "GET" || !${JSON.stringify(paths)}.includes(url.pathname) ||
      request.headers.has("authorization") || request.headers.has("cookie") ||
      url.pathname.startsWith("/__void/");
  }`;
}
