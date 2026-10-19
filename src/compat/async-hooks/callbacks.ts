// Vite dev can load a prebundled API and a source module in the same realm.
// Both must capture from the same async context, without replacing timer globals.
type Callback = (...args: any[]) => any;
type Binding = (callback: Callback) => Callback;
const key = Symbol.for("workers-capacitor/callback-binding");
const realm = globalThis as unknown as Record<
  symbol,
  { bindings: Set<Binding> }
>;
const state = realm[key] ?? { bindings: new Set<Binding>() };
if (!realm[key]) Object.defineProperty(realm, key, { value: state });
export const contextAware = Symbol.for("workers-capacitor/context-aware");
export function addCallbackBinding(binding: Binding) {
  state.bindings.add(binding);
}
export function bindCallback<T extends Callback>(callback: T): T {
  let bound: Callback = callback;
  for (const bind of state.bindings) bound = bind(bound);
  return bound as T;
}
export function markContextAware(callback: Function) {
  Object.defineProperty(callback, contextAware, { value: true });
}
