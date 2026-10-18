// The public URL/URLSearchParams algorithms only require USVString and UTF-8.
// Keeping this boundary explicit avoids Node-only WebIDL buffer introspection
// and legacy HTML encoding tables in the browser parser.
const concat = String.prototype.concat;
export function USVString(value: unknown): string {
  return concat
    .call("", value as string)
    .replace(/[\ud800-\udfff]/gu, "\ufffd");
}
const encoder = new TextEncoder();
export function percentEncodeAfterEncoding(
  encoding: string,
  input: string,
  set: string,
): string {
  if (encoding !== "utf-8") throw new TypeError("URL API requires UTF-8");
  let result = "";
  for (const byte of encoder.encode(input)) {
    const c = String.fromCharCode(byte);
    result +=
      byte < 0x20 || byte > 0x7e || set.includes(c)
        ? "%" + byte.toString(16).toUpperCase().padStart(2, "0")
        : c;
  }
  return result;
}

export function any(value: unknown): unknown {
  return value;
}
