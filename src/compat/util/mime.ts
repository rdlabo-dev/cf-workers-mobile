// Port of workerd 5358e3d api/node/util.c++ and util/mimetype.c++.
// Copyright (c) Cloudflare, Inc. Licensed under Apache-2.0.
type State = { type: string; subtype: string; params: [string, string][] };
const parameterStates = new WeakMap<MIMEParams, WeakRef<State> | undefined>();
// workerd intentionally permits backslash in a token.
const token = /^[!#$%&'*+\\\-.^_`|~0-9A-Za-z]+$/;
const quoted = /^[\t\x20-\x7e\x80-\uffff]*$/;
const leading = /^[\r\n\t ]+/;
const trailing = /[\r\n\t ]+$/;
function text(value: unknown): string {
  if (typeof value === "symbol")
    throw new TypeError("Cannot convert a Symbol value to a string");
  const string = `${value}`;
  // JSG's UTF-8 strings replace unpaired UTF-16 surrogates.
  return string.replace(
    /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g,
    "\ufffd",
  );
}
function required(count: number, position: number, method?: string) {
  if (count >= position) return;
  const context = method
    ? `Failed to execute '${method}' on 'MIMEParams': parameter ${position}`
    : "Failed to construct 'MIMEType': constructor parameter 1";
  throw new TypeError(`${context} is not of type 'string'.`);
}
function add(state: State, name: string, value: string): boolean {
  if (!token.test(name) || !quoted.test(value)) return false;
  const lower = name.toLowerCase();
  // The pinned C++ upsert deliberately keeps the first value, including set().
  if (!state.params.some(([key]) => key === lower))
    state.params.push([lower, value]);
  return true;
}
function parse(input: string): State | undefined {
  let remaining = input.replace(leading, "");
  const slash = remaining.indexOf("/");
  if (slash < 1) return;
  const type = remaining.slice(0, slash);
  if (!token.test(type)) return;
  remaining = remaining.slice(slash + 1);
  const semi = remaining.indexOf(";");
  const subtype = (semi < 0 ? remaining : remaining.slice(0, semi)).replace(
    trailing,
    "",
  );
  if (!token.test(subtype)) return;
  remaining = semi < 0 ? "" : remaining.slice(semi + 1);
  const state: State = {
    type: type.toLowerCase(),
    subtype: subtype.toLowerCase(),
    params: [],
  };
  while (remaining.length) {
    remaining = remaining.replace(leading, "");
    const delimiter = remaining.search(/[;=]/);
    if (delimiter < 0) break;
    if (remaining[delimiter] === ";") {
      remaining = remaining.slice(delimiter + 1);
      continue;
    }
    const name = remaining.slice(0, delimiter);
    remaining = remaining.slice(delimiter + 1);
    if (!token.test(name)) {
      const next = remaining.indexOf(";");
      if (next < 0) break;
      remaining = remaining.slice(next + 1);
      continue;
    }
    if (!remaining.length) break;
    if (remaining[0] === '"') {
      remaining = remaining.slice(1);
      let value = "";
      while (remaining.length) {
        const char = remaining[0];
        remaining = remaining.slice(1);
        if (char === '"') break;
        if (char === "\\") {
          if (!remaining.length) {
            value += "\\";
            break;
          }
          value += remaining[0];
          remaining = remaining.slice(1);
        } else value += char;
      }
      add(state, name, value);
      const next = remaining.indexOf(";");
      if (next < 0) break;
      remaining = remaining.slice(next + 1);
    } else {
      const next = remaining.indexOf(";");
      const value = (next < 0 ? remaining : remaining.slice(0, next)).replace(
        trailing,
        "",
      );
      if (value.length) add(state, name, value);
      if (next < 0) break;
      remaining = remaining.slice(next + 1);
    }
  }
  return state;
}
function serialize(params: [string, string][]): string {
  return params
    .map(([name, value]) => {
      const encoded = token.test(value)
        ? value
        : `"${value.replace(/["\\]/g, "\\$&")}"`;
      return `${name === "boundary" ? " " : ""}${name}=${encoded}`;
    })
    .join(";");
}
function stateOf(params: MIMEParams): State | undefined {
  if (!parameterStates.has(params))
    throw new TypeError(
      "Illegal invocation: function called with incorrect `this` reference. See https://developers.cloudflare.com/workers/observability/errors/#illegal-invocation-errors for details.",
    );
  return parameterStates.get(params)?.deref();
}
const iteratorStates = new WeakMap<
  object,
  { values: unknown[]; index: number }
>();
const iteratorPrototypes = new Map<string, object>();
function snapshot<T>(values: T[], tag: string): IterableIterator<T> {
  let prototype = iteratorPrototypes.get(tag);
  if (!prototype) {
    const Constructor = {
      [tag]: function () {
        throw new TypeError("Illegal constructor");
      },
    }[tag];
    prototype = Object.create(
      Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]())),
    );
    Object.defineProperties(prototype!, {
      next: {
        enumerable: true,
        configurable: true,
        writable: true,
        value: function next(this: object) {
          const state = iteratorStates.get(this);
          if (!state) throw new TypeError("Illegal invocation");
          return state.index < state.values.length
            ? { done: false, value: state.values[state.index++] }
            : { done: true };
        },
      },
      constructor: { value: Constructor, configurable: true, writable: true },
      [Symbol.toStringTag]: { value: tag, configurable: true },
    });
    iteratorPrototypes.set(tag, prototype!);
  }
  const iterator = Object.create(prototype!);
  iteratorStates.set(iterator, { values, index: 0 });
  return iterator;
}
export class MIMEParams {
  constructor() {
    parameterStates.set(this, undefined);
  }
  delete(name: unknown): void {
    const state = stateOf(this);
    required(arguments.length, 1, "delete");
    const key = text(name).toLowerCase();
    if (!state) return;
    const index = state.params.findIndex(([name]) => name === key);
    // KJ HashMap removes by moving the last entry into the erased slot.
    if (index >= 0) {
      const last = state.params.pop()!;
      if (index < state.params.length) state.params[index] = last;
    }
  }
  get(name: unknown): string | null {
    const state = stateOf(this);
    required(arguments.length, 1, "get");
    const key = text(name);
    return state?.params.find(([name]) => name === key)?.[1] ?? null;
  }
  has(name: unknown): boolean {
    const state = stateOf(this);
    required(arguments.length, 1, "has");
    const key = text(name);
    return state?.params.some(([name]) => name === key) ?? false;
  }
  set(name: unknown, value: unknown): void {
    const state = stateOf(this);
    required(arguments.length, 1, "set");
    const key = text(name);
    required(arguments.length, 2, "set");
    const converted = text(value);
    if (state && !add(state, key, converted))
      throw new TypeError("Not a valid MIME parameter");
  }
  entries(): IterableIterator<[string, string]> {
    return snapshot(
      (stateOf(this)?.params ?? []).map(([k, v]): [string, string] => [k, v]),
      "EntryIterator",
    );
  }
  keys(): IterableIterator<string> {
    return snapshot(
      (stateOf(this)?.params ?? []).map(([key]) => key),
      "KeyIterator",
    );
  }
  values(): IterableIterator<string> {
    return snapshot(
      (stateOf(this)?.params ?? []).map(([, value]) => value),
      "ValueIterator",
    );
  }
  toString() {
    return serialize(stateOf(this)?.params ?? []);
  }
  toJSON() {
    return serialize(stateOf(this)?.params ?? []);
  }
  [Symbol.iterator]() {
    return MIMEParams.prototype.entries.call(this);
  }
}
const mimeStates = new WeakMap<
  MIMEType,
  { state: State; params: MIMEParams }
>();
function mimeOf(value: MIMEType) {
  const state = mimeStates.get(value);
  if (!state)
    throw new TypeError(
      "Illegal invocation: function called with incorrect `this` reference. See https://developers.cloudflare.com/workers/observability/errors/#illegal-invocation-errors for details.",
    );
  return state;
}
function serializeMime(value: MIMEType) {
  const { state } = mimeOf(value);
  const params = serialize(state.params);
  return `${state.type}/${state.subtype}${params ? `;${params}` : ""}`;
}
export class MIMEType {
  constructor(input: unknown) {
    required(arguments.length, 1);
    const converted = text(input);
    const state = parse(converted);
    if (!state) throw new TypeError(`Not a valid MIME type: ${converted}`);
    const params = new MIMEParams();
    parameterStates.set(params, new WeakRef(state));
    mimeStates.set(this, { state, params });
  }
  get type() {
    return mimeOf(this).state.type;
  }
  set type(value: unknown) {
    const { state } = mimeOf(this);
    const converted = text(value);
    if (!token.test(converted)) throw new TypeError("Not a valid MIME type");
    state.type = converted.toLowerCase();
  }
  get subtype() {
    return mimeOf(this).state.subtype;
  }
  set subtype(value: unknown) {
    const { state } = mimeOf(this);
    const converted = text(value);
    if (!token.test(converted)) throw new TypeError("Not a valid MIME subtype");
    state.subtype = converted.toLowerCase();
  }
  get essence() {
    const { state } = mimeOf(this);
    return `${state.type}/${state.subtype}`;
  }
  get params() {
    return mimeOf(this).params;
  }
  toString() {
    return serializeMime(this);
  }
  toJSON() {
    return serializeMime(this);
  }
}

for (const [tag, Type] of Object.entries({ MIMEType, MIMEParams })) {
  for (const name of Object.getOwnPropertyNames(Type.prototype)) {
    if (name === "constructor") continue;
    Object.defineProperty(Type.prototype, name, {
      ...Object.getOwnPropertyDescriptor(Type.prototype, name),
      enumerable: true,
    });
  }
  Object.defineProperty(Type.prototype, Symbol.toStringTag, {
    value: tag,
    configurable: true,
  });
}
