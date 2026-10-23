// Optional compatibility modules register request-local state here. Keeping
// this leaf dependency-free preserves the raw browser ESM entry point.
type Scope = <T>(callback: () => T) => T;
const scopes = new Set<Scope>();
export function registerRequestScope(scope: Scope): void {
  scopes.add(scope);
}
export function runWithRequestScope<T>(callback: () => T): T {
  const entries = [...scopes];
  const run = (index: number): T =>
    index === entries.length
      ? callback()
      : entries[index](() => run(index + 1));
  return run(0);
}
