// Phase 1 has no remote bindings or automatic secret import.
export const env: Record<string, unknown> = new Proxy(Object.freeze({}), {
  get(_target, name) {
    throw new Error(
      `cloudflare:workers env.${String(name)} is not configured. Bindings are outside this PoC.`,
    );
  },
});
