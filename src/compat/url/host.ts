import { toASCII } from "./unicode.js";
const special = /^(?:https?|wss?|ftp|file):$/;
const forbidden = /[\x00-\x20\x7f#%/:<>?@[\\\]^|]/;
/** Convert before the platform parser so its Unicode version cannot change acceptance. */
function asciiHost(host: string): string {
  if (!host || host.startsWith("[")) return host;
  let decoded: string;
  try {
    decoded = decodeURIComponent(host);
  } catch {
    throw new TypeError("Invalid URL string.");
  }
  const result = toASCII(decoded);
  if (!result || forbidden.test(result))
    throw new TypeError("Invalid URL string.");
  return result;
}
function authority(value: string): string {
  const at = value.lastIndexOf("@") + 1;
  const prefix = value.slice(0, at),
    host = value.slice(at);
  if (host.startsWith("[")) return value;
  const colon = host.indexOf(":");
  return (
    prefix +
    asciiHost(colon < 0 ? host : host.slice(0, colon)) +
    (colon < 0 ? "" : host.slice(colon))
  );
}
function opaqueAuthority(value: string): string {
  const at = value.lastIndexOf("@") + 1;
  const host = value.slice(at);
  return (
    value.slice(0, at) +
    host.replace(/[^\x00-\x7f]/gu, (c) =>
      Array.from(
        new TextEncoder().encode(c),
        (b) => "%" + b.toString(16).toUpperCase().padStart(2, "0"),
      ).join(""),
    )
  );
}
export function prepareHost(value: string, protocol: string): string {
  if (!special.test(protocol)) return opaqueAuthority(value);
  // The setter stops at a literal delimiter before IDNA. A delimiter produced
  // by IDNA mapping must instead reject the whole host.
  return authority(value.replace(/[\t\n\r]/g, "").split(/[/?#\\]/, 1)[0]!);
}
export function prepareURL(value: string, base?: string): string {
  const input = value
    .replace(/[\t\n\r]/g, "")
    .replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, "");
  const scheme = input.match(/^([a-z][a-z0-9+.-]*:)/i)?.[0];
  const baseScheme = base?.match(/^([a-z][a-z0-9+.-]*:)/i)?.[0].toLowerCase();
  const protocol = scheme?.toLowerCase() ?? baseScheme;
  if (!protocol) return input;
  if (!special.test(protocol)) {
    const prefix = scheme?.length ?? 0;
    if (!input.slice(prefix).startsWith("//")) return input;
    const end = input.slice(prefix + 2).search(/[/?#]/);
    const stop = end < 0 ? input.length : prefix + 2 + end;
    return (
      input.slice(0, prefix + 2) +
      opaqueAuthority(input.slice(prefix + 2, stop)) +
      input.slice(stop)
    );
  }
  const start = scheme?.length ?? 0;
  const rest = input.slice(start).replace(/\\/g, "/");
  let offset: number;
  if (protocol === "file:") {
    if (!rest.startsWith("//")) return input;
    offset = 2;
  } else if (rest.startsWith("//")) offset = rest.match(/^\/+/)![0].length;
  else if (scheme && protocol !== baseScheme)
    offset = rest.match(/^\/*/)![0].length;
  else return input;
  const end = rest.slice(offset).search(/[/?#]/);
  const stop = end < 0 ? rest.length : offset + end;
  const host = rest.slice(offset, stop);
  // In a file URL a drive letter occupies the authority position syntactically
  // but belongs to its path; leave that decision to the platform parser.
  if (protocol === "file:" && /^[a-z][:|]$/i.test(host))
    return input.slice(0, start) + "///" + host[0] + ":" + rest.slice(stop);
  return (
    input.slice(0, start) +
    rest.slice(0, offset) +
    authority(host) +
    rest.slice(stop)
  );
}

/** Resolve file paths with the URL Standard's platform-independent drive rules. */
export function normalizeFile(
  url: globalThis.URL,
  input: string,
  base: string | undefined,
  NativeURL: typeof globalThis.URL,
): void {
  if (url.protocol !== "file:") return;
  if (url.hostname === "localhost") url.hostname = "";
  let basePath = "";
  if (base && /^file:/i.test(base)) {
    const parsed = new NativeURL(base);
    normalizeFile(parsed, base, undefined, NativeURL);
    basePath = parsed.pathname;
  }
  const scheme = input.match(/^([a-z][a-z0-9+.-]*:)/i)?.[0];
  const rest = input.slice(scheme?.length ?? 0).replace(/\\/g, "/");
  let path = rest.split(/[?#]/, 1)[0]!;
  if (path.startsWith("//")) {
    const end = path.indexOf("/", 2);
    path = end < 0 ? "/" : path.slice(end);
  } else if (path.startsWith("/")) {
    const drive = basePath.match(/^\/([a-z]:)(?:\/|$)/i)?.[1];
    if (drive && !/^\/[a-z][:|](?:\/|$)/i.test(path)) path = "/" + drive + path;
  } else if (!path && basePath) {
    path = basePath;
  } else if (basePath && !/^[a-z][:|](?:\/|$)/i.test(path)) {
    path = basePath.slice(0, basePath.lastIndexOf("/") + 1) + path;
  }
  Object.getOwnPropertyDescriptor(NativeURL.prototype, "pathname")!.set!.call(
    url,
    filePath(path),
  );
}
export function filePath(input: string): string {
  let path = input.replace(/[\t\r\n]/g, "").replace(/\\/g, "/");
  if (!path.startsWith("/")) path = "/" + path;
  const segments = path.slice(1).split("/"),
    result: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    let part = segments[i]!;
    const dots = part.replace(/%2e/gi, ".");
    if (dots === "..") {
      if (!(result.length === 1 && /^[a-z]:$/i.test(result[0]!))) result.pop();
      if (i === segments.length - 1) result.push("");
    } else if (dots === ".") {
      if (i === segments.length - 1) result.push("");
    } else {
      if (!result.length && /^[a-z][:|]$/i.test(part)) part = part[0] + ":";
      result.push(part);
    }
  }
  return "/" + result.join("/");
}
