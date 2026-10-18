import { filePath, normalizeFile, prepareHost, prepareURL } from "./host.js";
import { platform } from "../globals/platform.js";
const coerceString = String.prototype.concat;
const nativeBlobSize = Object.getOwnPropertyDescriptor(
  platform.Blob.prototype,
  "size",
)!.get!;
const hostKey = Symbol.for("@rdlabo/capacitor-workers/native-url");
const NativeURL: typeof globalThis.URL =
  (globalThis.URL as unknown as Record<symbol, typeof globalThis.URL>)[
    hostKey
  ] ?? globalThis.URL;
const forbiddenEscapedHost =
  /%(?:00|09|0a|0d|20|23|25|2f|3a|3c|3e|3f|40|5b|5c|5d|5e|7c)/i;
function invalid(url: globalThis.URL): boolean {
  return (
    /^(?:https?|wss?|ftp|file):$/.test(url.protocol) &&
    forbiddenEscapedHost.test(url.hostname)
  );
}
/** Keep native URL internal slots; correct the permissive Chromium host parser. */
export class URL extends NativeURL {
  constructor(input: string | globalThis.URL, base?: string | globalThis.URL) {
    if (!arguments.length)
      throw new TypeError(
        "Failed to construct 'URL': constructor parameter 1 is not of type 'USVString'.",
      );
    const value = `${input}`;
    const baseValue = base === undefined ? undefined : prepareURL(`${base}`);
    if (baseValue !== undefined && invalid(new NativeURL(baseValue)))
      throw new TypeError("Invalid base URL string.");
    super(prepareURL(value, baseValue), baseValue);
    normalizeFile(this, prepareURL(value, baseValue), baseValue, NativeURL);
    if (invalid(this)) throw new TypeError("Invalid URL string.");
  }
  override get href() {
    return super.href;
  }
  override set href(value: string) {
    const input = prepareURL(`${value}`);
    const next = new NativeURL(input);
    if (invalid(next)) throw new TypeError("Invalid URL string.");
    super.href = next.href;
    normalizeFile(this, input, undefined, NativeURL);
  }
  override get pathname() {
    return super.pathname;
  }
  override set pathname(value: string) {
    const input = `${value}`;
    super.pathname = super.protocol === "file:" ? filePath(input) : input;
  }
  override get host() {
    return super.host;
  }
  override set host(value: string) {
    const next = new NativeURL(super.href);
    const input = `${value}`;
    try {
      next.host = prepareHost(input, next.protocol);
    } catch {
      return;
    }
    if (next.protocol === "file:" && next.hostname === "localhost")
      next.hostname = "";
    if (!invalid(next)) super.host = next.host;
  }
  override get hostname() {
    return super.hostname;
  }
  override set hostname(value: string) {
    const next = new NativeURL(super.href);
    const input = `${value}`;
    try {
      next.hostname = prepareHost(input, next.protocol);
    } catch {
      return;
    }
    if (next.protocol === "file:" && next.hostname === "localhost")
      next.hostname = "";
    if (!invalid(next)) super.hostname = next.hostname;
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
for (const fn of [URL, URL.canParse, URL.parse])
  Object.defineProperty(fn, "length", { value: 1 });
Object.defineProperty(URL, hostKey, { value: NativeURL });
export const URLSearchParams = globalThis.URLSearchParams;

export function isURLInstance(value: unknown): value is globalThis.URL {
  return value instanceof NativeURL;
}
