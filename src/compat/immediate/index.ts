// Workers' global Immediate has inert ref/unref methods: requests own lifetime.
const token = {};
const brands = new WeakSet<object>();
const handles = new WeakMap<Immediate, ReturnType<typeof setTimeout>>();
class Immediate {
  constructor(key: object) {
    if (key !== token) throw new TypeError("Illegal constructor");
    brands.add(this);
  }
  ref() {
    if (!brands.has(this)) throw new TypeError("Illegal invocation");
  }
  unref() {
    if (!brands.has(this)) throw new TypeError("Illegal invocation");
  }
  hasRef() {
    if (!brands.has(this)) throw new TypeError("Illegal invocation");
    return false;
  }
  [Symbol.dispose]() {
    clearImmediate(this);
  }
}
Object.defineProperty(Immediate.prototype, Symbol.toStringTag, {
  value: "Immediate",
  configurable: true,
});
export function setImmediate(
  callback: (...args: any[]) => void,
  ...args: any[]
): Immediate {
  if (typeof callback !== "function")
    throw new TypeError("Callback must be a function");
  const handle = new Immediate(token);
  handles.set(
    handle,
    setTimeout(() => {
      handles.delete(handle);
      Reflect.apply(callback, undefined, args);
    }, 0),
  );
  return handle;
}
export function clearImmediate(handle?: Immediate | null): void {
  if (arguments.length === 0)
    throw new TypeError("clearImmediate requires a handle");
  if (handle == null) return;
  if (!brands.has(handle)) throw new TypeError("Expected an Immediate");
  const timer = handles.get(handle);
  if (timer !== undefined) clearTimeout(timer);
  handles.delete(handle);
}
