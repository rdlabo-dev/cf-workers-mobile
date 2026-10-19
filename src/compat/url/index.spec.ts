import { testIdna } from "./idna.spec";
import { testParsing } from "./parsing.spec";
import * as namespace from "node:url";
import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/workers-capacitor/shared/contracts";
import type { ContractSuite } from "@rdlabo/workers-capacitor/shared/contracts/testing";
import { legacyCases } from "./legacy.spec";
import { modernCases } from "./modern.spec";
import assert, {
  deepStrictEqual,
  strictEqual,
  throws,
} from "./assertions.spec";
const upstreamGroups = [
  "format",
  "relative",
  "urlToHttpOptions",
  "formatWhatwg",
  "urlParseQuery",
  "urlParseFormat",
  "urlParseInvalidInput",
  "testDomainAsciiUnicode",
  "whatwgURLCustomDomainTo",
  "domainToAsciiCoercionSafety",
  "urlAndSearchParams",
  "testFileURLToPath",
  "testPathToFileURL",
] as const;
const groups = [
  ...upstreamGroups,
  "exports",
  "pathCoercion",
  "domainHostParsing",
  "urlMutations",
  "searchParams",
  "webErrorsAndIdentity",
] as const;
type Api = typeof namespace & {
  default: typeof namespace;
  Url: { prototype: object };
  toPathIfFileURL(value: unknown): unknown;
};
export const urlFeature = defineFeature<Api>()("node.url", groups);
const upstream = Object.fromEntries(
  upstreamGroups.map((name) => [
    name,
    (api: Api) => ({ ...legacyCases(api), ...modernCases(api) })[name]!.test(),
  ]),
) as Record<
  (typeof upstreamGroups)[number],
  (api: Api) => void | Promise<void>
>;
export const urlContract: ContractSuite<typeof urlFeature> = {
  feature: urlFeature,
  cases: {
    ...upstream,
    exports(api) {
      const names = [
        "URL",
        "URLSearchParams",
        "Url",
        "domainToASCII",
        "domainToUnicode",
        "fileURLToPath",
        "format",
        "parse",
        "pathToFileURL",
        "resolve",
        "resolveObject",
        "toPathIfFileURL",
        "urlToHttpOptions",
      ];
      deepStrictEqual(
        Object.keys(api)
          .filter((n) => n !== "default")
          .sort(),
        names.sort(),
      );
      deepStrictEqual(
        Object.getOwnPropertyNames(api.URL.prototype).sort(),
        [
          "origin",
          "href",
          "protocol",
          "username",
          "password",
          "host",
          "hostname",
          "port",
          "pathname",
          "search",
          "hash",
          "searchParams",
          "toJSON",
          "toString",
          "constructor",
        ].sort(),
      );
      deepStrictEqual(
        Object.getOwnPropertyNames(api.URLSearchParams.prototype).sort(),
        [
          "size",
          "append",
          "delete",
          "get",
          "getAll",
          "has",
          "set",
          "sort",
          "entries",
          "keys",
          "values",
          "forEach",
          "toString",
          "constructor",
        ].sort(),
      );
      for (const name of names)
        strictEqual((api as any)[name], (api.default as any)[name]);
      deepStrictEqual(
        Object.getOwnPropertyNames(api.Url.prototype).sort(),
        [
          "constructor",
          "parse",
          "format",
          "resolve",
          "resolveObject",
          "parseHost",
        ].sort(),
      );
    },
    pathCoercion(api) {
      const plain = {};
      strictEqual(api.toPathIfFileURL(plain), plain);
      strictEqual(api.toPathIfFileURL("file:///a"), "file:///a");
      strictEqual(api.toPathIfFileURL(new api.URL("file:///a%20b")), "/a b");
      throws(() => api.toPathIfFileURL(new api.URL("https://example.com")), {
        code: "ERR_INVALID_URL_SCHEME",
      });
    },
    domainHostParsing(api) {
      testIdna(api);
      for (const [input, ascii, unicode] of [
        ["a/b", "a", "a"],
        ["127.1", "127.0.0.1", "127.0.0.1"],
        ["xn--", "xn--", "xn--"],
        ["xn--a", "xn--a", "xn--a"],
        ["a b", "", ""],
        ["a／b.test", "", ""],
        ["a℀b.test", "", ""],
        ["a℅b.test", "", ""],
        ["a\u{10f7f}b.test", "xn--ab-q53o.test", "a\u{10f7f}b.test"],
        ["a%20b", "", ""],
        ["[::1]", "[::1]", "[::1]"],
        ["例え.テスト", "xn--r8jz45g.xn--zckzah", "例え.テスト"],
      ]) {
        strictEqual(api.domainToASCII(input), ascii);
        strictEqual(api.domainToUnicode(input), unicode);
      }
    },
    urlMutations(api) {
      testParsing(api.URL);
      const url = new api.URL(
        "../b?a=1#x",
        "https://user:pass@example.com/a/c",
      );
      strictEqual(url.href, "https://user:pass@example.com/b?a=1#x");
      url.hostname = "例え.テスト";
      strictEqual(url.hostname, "xn--r8jz45g.xn--zckzah");
      for (const input of [
        "http://a\u{10f7f}b.test/x",
        "//a\u{10f7f}b.test/x",
        "http:a\u{10f7f}b.test/x",
      ]) {
        strictEqual(
          new api.URL(input, "https://base.test").href,
          input.startsWith("//")
            ? "https://xn--ab-q53o.test/x"
            : "http://xn--ab-q53o.test/x",
        );
      }
      const file = new api.URL("file:///C:/base");
      file.pathname = "/C:/a/../../x";
      strictEqual(file.href, "file:///C:/x");
      file.pathname = "/C|/x";
      strictEqual(file.href, "file:///C:/x");
      const unicodeHost = new api.URL("http://initial.test/");
      for (const property of ["host", "hostname"] as const) {
        unicodeHost[property] = "a\u{10f7f}b.test";
        strictEqual(unicodeHost.hostname, "xn--ab-q53o.test");
        unicodeHost[property] = "a／b.test";
        strictEqual(unicodeHost.hostname, "xn--ab-q53o.test");
      }
      throws(() => new api.URL("http://a／b.test/"), { name: "TypeError" });
      url.searchParams.append("b", "a b");
      strictEqual(url.search, "?a=1&b=a+b");
      url.search = "?c=3";
      strictEqual(url.searchParams.get("c"), "3");
      url.port = "443";
      strictEqual(url.port, "");
      url.hash = "";
      strictEqual(url.hash, "");
      strictEqual(api.URL.canParse(url.href), true);
      strictEqual(api.URL.parse("not a url"), null);
      throws(() => new api.URL("http://a%20b/"), { name: "TypeError" });
    },
    webErrorsAndIdentity(api) {
      strictEqual(api.URL, globalThis.URL);
      strictEqual(api.URLSearchParams, globalThis.URLSearchParams);
      for (const method of [api.URL.canParse, api.URL.parse]) {
        throws(() => Reflect.apply(method, api.URL, []), { name: "TypeError" });
        throws(() => Reflect.apply(method, api.URL, [Symbol()]), {
          name: "TypeError",
        });
      }
      throws(
        () =>
          Reflect.apply(api.URL.createObjectURL, api.URL, [new Blob(["a"])]),
        {
          name: "Error",
          message: "URL.createObjectURL() is not implemented",
        },
      );
      throws(() => Reflect.apply(api.URL.createObjectURL, api.URL, [{}]), {
        name: "TypeError",
      });
      throws(() => api.URL.revokeObjectURL("blob:test"), {
        name: "Error",
        message: "URL.revokeObjectURL() is not implemented",
      });
      throws(
        () => Reflect.apply(api.URL.revokeObjectURL, api.URL, [Symbol()]),
        { name: "TypeError" },
      );
      const url = new api.URL("https://valid.example/path");
      url.hostname = "a%20b";
      strictEqual(url.hostname, "valid.example");
      url.host = "a%20b:81";
      strictEqual(url.host, "valid.example");
      throws(
        () => {
          url.href = "https://a%20b";
        },
        { name: "TypeError" },
      );
      strictEqual(url.href, "https://valid.example/path");
      strictEqual(api.URL.canParse("https://a%20b"), false);
      strictEqual(api.URL.parse("https://a%20b"), null);
    },
    async searchParams(api) {
      const queryURL = new api.URL("https://example.com/?q=a%20b");
      const reference = queryURL.searchParams;
      strictEqual(queryURL.href, "https://example.com/?q=a%20b");
      api.URLSearchParams.prototype.sort.call(reference);
      strictEqual(queryURL.href, "https://example.com/?q=a+b");
      queryURL.href = "https://example.com/?c=3";
      strictEqual(queryURL.searchParams, reference);
      strictEqual(reference.get("c"), "3");
      queryURL.search = "?c=4";
      strictEqual(reference.get("c"), "4");
      const linked = new api.URL("https://example.com/?a=1");
      api.URLSearchParams.prototype.append.call(
        linked.searchParams,
        "b",
        "x y",
      );
      strictEqual(linked.href, "https://example.com/?a=1&b=x+y");
      for (const body of [
        new api.URLSearchParams("a=1"),
        linked.searchParams,
      ]) {
        const request = new Request("https://example.com", {
          method: "POST",
          body,
        });
        const response = new Response(body);
        strictEqual(
          request.headers.get("content-type"),
          "application/x-www-form-urlencoded;charset=UTF-8",
        );
        strictEqual(
          response.headers.get("content-type"),
          "application/x-www-form-urlencoded;charset=UTF-8",
        );
        strictEqual(await request.text(), body.toString());
        strictEqual(await response.text(), body.toString());
      }
      const params = new api.URLSearchParams("a=1&a=2&b=x+y");
      deepStrictEqual(params.getAll("a"), ["1", "2"]);
      params.delete("a", "1");
      strictEqual(params.get("a"), "2");
      params.append("a", "3");
      params.sort();
      strictEqual(params.size, 3);
      strictEqual(params.toString(), "a=2&a=3&b=x+y");
      deepStrictEqual([...params.keys()], ["a", "a", "b"]);
      params.set("a", "4");
      strictEqual(params.has("a", "4"), true);
      strictEqual(params.has("a", "2"), false);
      deepStrictEqual(
        [...params.entries()],
        [
          ["a", "4"],
          ["b", "x y"],
        ],
      );
      deepStrictEqual([...params.values()], ["4", "x y"]);
      deepStrictEqual([...params], [...params.entries()]);
      const seen: string[] = [];
      const receiver = {};
      params.forEach(function (this: unknown, value, key, parent) {
        strictEqual(this, receiver);
        strictEqual(parent, params);
        seen.push(`${key}=${value}`);
      }, receiver);
      deepStrictEqual(seen, ["a=4", "b=x y"]);
      strictEqual(
        new api.URLSearchParams({ a: "b c", b: "日本語" }).toString(),
        "a=b+c&b=%E6%97%A5%E6%9C%AC%E8%AA%9E",
      );
      strictEqual(
        new api.URLSearchParams([
          ["a", "1"],
          ["a", "2"],
        ]).toString(),
        "a=1&a=2",
      );
      for (const tuple of [["a"], ["a", "b", "c"]])
        throws(() => new api.URLSearchParams([tuple]), { name: "TypeError" });
      const url = new api.URL("https://example.com/?b=2&a=1");
      const live = url.searchParams;
      live.sort();
      strictEqual(url.search, "?a=1&b=2");
      url.href = "https://example.org/?c=3";
      strictEqual(url.searchParams, live);
      strictEqual(live.toString(), "c=3");
      live.delete("c");
      strictEqual(url.href, "https://example.org/");
    },
  },
};
export class UrlImplementation extends FeatureImplementation<
  typeof urlFeature
> {
  constructor() {
    super(
      urlFeature,
      Object.fromEntries(
        groups.map((name) => [name, { status: "supported" }]),
      ) as Record<(typeof groups)[number], { status: "supported" }>,
    );
  }
  create(): Api {
    return namespace as Api;
  }
}
