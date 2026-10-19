// Bindings arrive per request through the fetch signature; the worker
// transport installs them so module-scope `env` reads resolve too.
let workerEnv: Record<string, unknown> = {};

/** Runtime-internal: called by the dispatch layer before worker.fetch. */
export function setWorkerEnv(env: unknown): void {
  workerEnv =
    env !== null && typeof env === "object"
      ? (env as Record<string, unknown>)
      : {};
}

export const env: Record<string, unknown> = new Proxy(Object.create(null), {
  get(_target, name) {
    return workerEnv[String(name)];
  },
  has(_target, name) {
    return String(name) in workerEnv;
  },
  ownKeys() {
    return Reflect.ownKeys(workerEnv);
  },
  getOwnPropertyDescriptor(_target, name) {
    const value = workerEnv[String(name)];
    return value === undefined
      ? undefined
      : { configurable: true, enumerable: true, value };
  },
});

// Durable Object namespaces need stateful storage; bundles such as OpenNext
// export subclass shells that must at least resolve and construct.
export class DurableObject<Env = unknown> {
  constructor(
    protected readonly ctx: unknown,
    protected readonly env: Env,
  ) {}
}
