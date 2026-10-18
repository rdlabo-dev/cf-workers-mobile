// Phase 1 has no remote bindings or automatic secret import.
export const env: Record<string, unknown> = new Proxy(Object.freeze({}), {
  get(_target, name) {
    throw new Error(
      `cloudflare:workers env.${String(name)} is not configured. Bindings are outside this PoC.`,
    );
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
