import { toASCII, toUnicode as unicode } from "./unicode.js";
import { URL as HostURL } from "./web-url.js";
function parsedHostname(domain: string): string {
  if (!domain) return "";
  const url = new HostURL("ws://url-compat.invalid");
  url.hostname = domain;
  if (url.hostname === "url-compat.invalid") {
    const other = new HostURL("ws://other-url-compat.invalid");
    other.hostname = domain;
    if (other.hostname === "other-url-compat.invalid") return "";
  }
  // Chromium versions accepting percent-encoded spaces in a special host
  // diverge from Workers and the URL Standard.
  if (
    /%(?:00|09|0a|0d|20|23|25|2f|3a|3c|3e|3f|40|5b|5c|5d|5e|7c)/i.test(
      url.hostname,
    )
  )
    return "";
  return url.hostname;
}
export default {
  domainToASCII: parsedHostname,
  domainToUnicode(domain: string): string {
    return unicode(parsedHostname(domain));
  },
  toASCII,
  format(
    input: string,
    fragment: boolean,
    asUnicode: boolean,
    search: boolean,
    auth: boolean,
  ): string {
    const url = new HostURL(input);
    if (!fragment) url.hash = "";
    if (!search) url.search = "";
    if (!auth) {
      url.username = "";
      url.password = "";
    }
    if (!asUnicode || !url.hostname) return url.href;
    const start =
      url.protocol.length +
      2 +
      (url.username || url.password
        ? url.username.length + (url.password ? url.password.length + 1 : 0) + 1
        : 0);
    return (
      url.href.slice(0, start) +
      unicode(url.hostname) +
      url.href.slice(start + url.hostname.length)
    );
  },
};
