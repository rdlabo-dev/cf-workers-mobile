import { NativeURL, hostKey, instanceKey } from "./brand.js";
export { isURLInstance } from "./brand.js";
import { URL as StandardURL } from "./standard-url.js";
import { platform } from "../globals/platform.js";
const coerceString = String.prototype.concat;
const nativeBlobSize = Object.getOwnPropertyDescriptor(
  platform.Blob.prototype,
  "size",
)!.get!;
const NativeParams = globalThis.URLSearchParams;
// A native URL owns each exposed query list. This preserves BodyInit branding
// and live updates even when applications borrow URLSearchParams.prototype methods.
const queries = new WeakMap<URL, globalThis.URL>();
const hrefDescriptor = Object.getOwnPropertyDescriptor(
  StandardURL.prototype,
  "href",
)!;
const searchDescriptor = Object.getOwnPropertyDescriptor(
  StandardURL.prototype,
  "search",
)!;
function queryOf(href: string): string {
  const beforeHash = href.split("#", 1)[0]!;
  const at = beforeHash.indexOf("?");
  return at < 0 ? "" : beforeHash.slice(at);
}
function refreshQuery(url: URL) {
  const query = queries.get(url);
  if (query) query.search = queryOf(hrefDescriptor.get!.call(url));
}
function serialized(url: URL): string {
  // Also performs the standard parser's receiver brand check.
  hrefDescriptor.get!.call(url);
  const query = queries.get(url);
  if (query) searchDescriptor.set!.call(url, queryOf(query.href));
  return hrefDescriptor.get!.call(url);
}
/** JS URL Standard parser with the fixed Workers IDNA profile. */
export class URL extends (StandardURL as typeof globalThis.URL) {
  override get searchParams(): URLSearchParams {
    hrefDescriptor.get!.call(this);
    let query = queries.get(this);
    if (!query) {
      query = new NativeURL("query://url-compat.invalid/");
      queries.set(this, query);
      refreshQuery(this);
    }
    return query.searchParams;
  }
  override get href() {
    return serialized(this);
  }
  override set href(value: string) {
    hrefDescriptor.set!.call(this, value);
    refreshQuery(this);
  }
  override get search() {
    serialized(this);
    return searchDescriptor.get!.call(this);
  }
  override set search(value: string) {
    searchDescriptor.set!.call(this, value);
    refreshQuery(this);
  }
  override toString() {
    return serialized(this);
  }
  override toJSON() {
    return serialized(this);
  }
  static override canParse(
    input: string | globalThis.URL,
    base?: string | globalThis.URL,
  ): boolean {
    if (!arguments.length)
      throw new TypeError(
        "Failed to execute 'canParse' on 'URL': parameter 1 is not of type 'USVString'.",
      );
    // Coercion exceptions escape, just as they do in Workers.
    const value = `${input}`,
      baseValue = base === undefined ? undefined : `${base}`;
    try {
      new URL(value, baseValue);
      return true;
    } catch {
      return false;
    }
  }
  static override parse(
    input: string | globalThis.URL,
    base?: string | globalThis.URL,
  ): URL | null {
    if (!arguments.length)
      throw new TypeError(
        "Failed to execute 'parse' on 'URL': parameter 1 is not of type 'USVString'.",
      );
    const value = `${input}`,
      baseValue = base === undefined ? undefined : `${base}`;
    try {
      return new URL(value, baseValue);
    } catch {
      return null;
    }
  }
  static override createObjectURL(_object: Blob): string {
    try {
      nativeBlobSize.call(_object);
    } catch {
      throw new TypeError(
        "Failed to execute 'createObjectURL' on 'URL': parameter 1 is not of type 'File or Blob'.",
      );
    }
    throw new Error("URL.createObjectURL() is not implemented");
  }
  static override revokeObjectURL(_url: string): void {
    if (!arguments.length)
      throw new TypeError(
        "Failed to execute 'revokeObjectURL' on 'URL': parameter 1 is not of type 'USVString'.",
      );
    // Keep observable ToString even in minified builds; a discarded template
    // literal can be removed by the bundler despite a Symbol/hostile coercion.
    coerceString.call("", _url);
    throw new Error("URL.revokeObjectURL() is not implemented");
  }
}
for (const key of Reflect.ownKeys(StandardURL.prototype)) {
  if (key !== "constructor" && !Object.hasOwn(URL.prototype, key))
    Object.defineProperty(
      URL.prototype,
      key,
      Object.getOwnPropertyDescriptor(StandardURL.prototype, key)!,
    );
}
Object.defineProperty(URL.prototype, instanceKey, {
  get() {
    Object.getOwnPropertyDescriptor(StandardURL.prototype, "href")!.get!.call(
      this,
    );
    return true;
  },
});
for (const fn of [URL, URL.canParse, URL.parse])
  Object.defineProperty(fn, "length", { value: 1 });
Object.defineProperty(URL, hostKey, { value: NativeURL });
export const URLSearchParams = NativeParams;
