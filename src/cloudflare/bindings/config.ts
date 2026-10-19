import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseJSON, type ParseError } from "jsonc-parser";
import { parse as parseTOML } from "smol-toml";

/** Select whole-Worker execution or explicitly permit route distribution. */
export type WorkerExecutionMode = "network" | "local";
export type WorkerExecution = WorkerExecutionMode | readonly LocalRoute[];

export interface LocalRoute {
  method:
    | "*"
    | "GET"
    | "HEAD"
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE"
    | "OPTIONS";
  /** Hono registration pattern, literal-prefix wildcard, or registration-text RegExp. */
  path: string | RegExp;
}

export interface ServerBuildOptions {
  /** Exact server-only file paths, relative to the bundler root. Symlinks resolve to the same file. */
  serverOnly?: string[];
  /** Defaults to network. local distributes the entire Worker; an array permits
   * selected routes and retained dependencies, subject to server boundaries. */
  execution?: WorkerExecution;
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
  /** Additional server-only names, including secrets and bindings supplied by other tools. */
  remoteBindings?: string[];
  /** Explicit acknowledgement that configured assets execute on the deployed Worker. */
  assetsExecution?: "remote";
  /** Names explicitly supplied through workersCapacitor({ env }); other env access stays on the server. */
  localBindings?: string[];
}
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
    "remoteBindings",
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
  function configured(key: string, child?: string, field = "binding") {
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
            (item: Record<string, unknown> | null) =>
              typeof item?.[field] !== "string" ||
              !(item[field] as string).trim(),
          ),
      )
    )
      throw new Error(`Invalid ${key}${child ? "." + child : ""} in ${file}`);
    return groups.flat().map((item: Record<string, string>) => item[field]);
  }
  // Each explicit list overrides only its own kind, without suppressing others.
  const d1 = options.d1Bindings ?? configured("d1_databases");
  const hyperdrive = options.hyperdriveBindings ?? configured("hyperdrive");
  const r2 = options.r2Bindings ?? configured("r2_buckets");
  const kv = options.kvBindings ?? configured("kv_namespaces");
  const policies =
    options.kvExecution === undefined
      ? (options.execution ?? "network") === "network"
        ? Object.fromEntries(kv.map((name) => [name, "remote"]))
        : {}
      : options.kvExecution;
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
  // These services retain their native API and authority on the deployed Worker.
  // Only names, never resource IDs or credentials, enter the generated graph.
  const remoteArrays = [
    "vectorize",
    "workflows",
    "analytics_engine_datasets",
    "mtls_certificates",
    "dispatch_namespaces",
    "secrets_store_secrets",
    "ai_search",
    "ai_search_namespaces",
  ];
  const remoteSingletons = [
    "ai",
    "browser",
    "images",
    "stream",
    "media",
    "analytics",
  ];
  const cloud = [
    ...configured("durable_objects", "bindings", "name"),
    ...remoteArrays.flatMap((key) => configured(key)),
    ...configured("ratelimits", undefined, "name"),
    ...configured("send_email", undefined, "name"),
  ];
  for (const key of remoteSingletons) {
    for (const environment of environments) {
      const value = environment[key];
      if (value === undefined) continue;
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        typeof value.binding !== "string" ||
        !value.binding.trim()
      )
        throw new Error(`Invalid ${key} in ${file}`);
      cloud.push(value.binding);
    }
  }
  // Unknown binding-shaped configuration must be acknowledged explicitly. Do not
  // silently ship a Worker whose only dependency was missed by discovery.
  const known = new Set([
    "env",
    "vars",
    "define",
    "d1_databases",
    "hyperdrive",
    "r2_buckets",
    "kv_namespaces",
    "services",
    "queues",
    "durable_objects",
    "ratelimits",
    "send_email",
    "assets",
    ...remoteArrays,
    ...remoteSingletons,
  ]);
  function unknown(value: unknown, path: string) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) unknown(item, path);
      return;
    }
    const record = value as Record<string, unknown>;
    // unsafe.bindings uses name rather than binding.
    const name = Object.hasOwn(record, "binding")
      ? record.binding
      : path.endsWith(".bindings")
        ? record.name
        : undefined;
    if (
      name !== undefined ||
      Object.hasOwn(record, "binding") ||
      path.endsWith(".bindings")
    ) {
      if (typeof name !== "string" || !name.trim())
        throw new Error(`Invalid binding declaration at ${path} in ${file}`);
      if (!options.remoteBindings?.includes(name))
        throw new Error(
          `Unsupported binding ${path}: ${name}. Add it to remoteBindings to execute it on the deployed Worker.`,
        );
    }
    for (const [key, child] of Object.entries(record))
      unknown(child, `${path}.${key}`);
  }
  for (const environment of environments)
    for (const [key, value] of Object.entries(environment))
      if (!known.has(key)) unknown(value, key);

  const assetNames: string[] = [];
  let assetRoutingRemote = false;
  const assetConfigs = environments
    .map((e) => e.assets)
    .filter((v) => v !== undefined);
  if (
    options.assetsExecution !== undefined &&
    options.assetsExecution !== "remote"
  )
    throw new TypeError(
      "Only assetsExecution: remote is supported; local ASSETS compatibility is not implemented",
    );
  if (options.assetsExecution !== undefined && !assetConfigs.length)
    throw new Error(
      "assetsExecution requires assets in the Worker configuration",
    );
  for (const assets of assetConfigs) {
    if (!assets || typeof assets !== "object" || Array.isArray(assets))
      throw new Error(`Invalid assets in ${file}`);
    if (
      !options.assetsExecution &&
      (options.execution ?? "network") !== "network"
    )
      throw new Error(
        "Set assetsExecution to remote; local ASSETS compatibility is not implemented",
      );
    if (
      assets.binding !== undefined &&
      (typeof assets.binding !== "string" || !assets.binding.trim())
    )
      throw new Error(`Invalid assets.binding in ${file}`);
    if (typeof assets.binding === "string") assetNames.push(assets.binding);
    if (assets.run_worker_first !== true || !assets.binding) {
      assetRoutingRemote = true;
    }
  }

  const scheduled = environments.some((environment) => {
    const triggers = environment.triggers;
    if (triggers === undefined) return false;
    if (
      !triggers ||
      typeof triggers !== "object" ||
      Array.isArray(triggers) ||
      (triggers.crons !== undefined &&
        (!Array.isArray(triggers.crons) ||
          triggers.crons.some((cron: unknown) => typeof cron !== "string")))
    )
      throw new Error(`Invalid triggers.crons in ${file}`);
    return !!triggers.crons?.length;
  });
  const cloudExports = environments.some((environment) => {
    const exports = environment.exports;
    if (exports === undefined) return false;
    if (!exports || typeof exports !== "object" || Array.isArray(exports))
      throw new Error(`Invalid exports in ${file}`);
    return Object.values(exports).some(
      (value) =>
        value &&
        typeof value === "object" &&
        ["workflow", "durable-object"].includes(
          (value as { type?: string }).type ?? "",
        ),
    );
  });
  const forceRemoteReason = consumers.length
    ? "Queue consumers execute only on the deployed Worker"
    : assetRoutingRemote
      ? "Asset-first routing executes on the deployed Worker"
      : scheduled
        ? "Scheduled handlers execute only on the deployed Worker"
        : cloudExports
          ? "Durable Object and Workflow exports execute only on the deployed Worker"
          : undefined;
  const remoteKV = kv.filter((name) => policies[name] === "remote");
  const serverOnly = [
    ...d1,
    ...hyperdrive,
    ...r2,
    ...services,
    ...queues,
    ...remoteKV,
    ...cloud,
    ...(options.remoteBindings ?? []),
    ...(options.assetsExecution === "remote" ? assetNames : []),
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
    forceRemoteReason,
    reportFile:
      !d1.length ||
      forceRemoteReason ||
      cloud.length ||
      options.remoteBindings?.length ||
      assetNames.length ||
      hyperdrive.length ||
      r2.length ||
      remoteKV.length ||
      services.length ||
      queues.length
        ? "workers-capacitor-server.json"
        : "workers-capacitor-d1.json",
  };
}
