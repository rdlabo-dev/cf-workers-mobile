import * as querystring from "node:querystring";
import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";

/** node:querystring module contract, matching the Workers baseline. */
export interface NodeQuerystringApi {
  parse(
    input: unknown,
    sep?: string | null,
    eq?: string | null,
    options?: {
      maxKeys?: number;
      decodeURIComponent?: (input: string) => string;
    },
  ): Record<string, string | string[] | undefined>;
  stringify(
    input: unknown,
    sep?: string | null,
    eq?: string | null,
    options?: { encodeURIComponent?: (input: string) => string },
  ): string;
  decode: NodeQuerystringApi["parse"];
  encode: NodeQuerystringApi["stringify"];
  escape(input: unknown): string;
  unescape(input: unknown, decodeSpaces?: boolean): string;
  unescapeBuffer(input: string, decodeSpaces?: boolean): Uint8Array;
  default?: NodeQuerystringApi;
}

function equal(actual: unknown, expected: unknown, label?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `${label ? `${label}: ` : ""}${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
    );
}
function throws(
  fn: () => unknown,
  expected: { name?: string; code?: string; message?: RegExp },
) {
  try {
    fn();
  } catch (error) {
    const e = error as { name?: string; code?: string; message?: string };
    if (expected.name && e?.name !== expected.name)
      throw new Error(`Expected error name ${expected.name}, got ${e?.name}`);
    if (expected.code && e?.code !== expected.code)
      throw new Error(`Expected error code ${expected.code}, got ${e?.code}`);
    if (expected.message && !expected.message.test(String(e?.message)))
      throw new Error(
        `Expected message ${expected.message}, got ${e?.message}`,
      );
    return;
  }
  throw new Error(`Expected ${expected.name} to be thrown`);
}

export const nodeQuerystringFeature = defineFeature<NodeQuerystringApi>()(
  "node.querystring",
  [
    "parseDuplicates",
    "parseLimits",
    "parseSeparators",
    "parseMalformed",
    "parseInputs",
    "stringifyValues",
    "stringifySeparators",
    "escapeUnescape",
    "customCodecs",
    "aliases",
    "shape",
  ],
);

export const nodeQuerystringContract: ContractSuite<
  typeof nodeQuerystringFeature
> = {
  feature: nodeQuerystringFeature,
  cases: {
    parseDuplicates(api) {
      equal(api.parse("a=1&a=2&b=3"), { a: ["1", "2"], b: "3" });
      const parsed = api.parse("__proto__=1&a=b");
      equal(parsed.__proto__, "1");
      equal(Object.getPrototypeOf(parsed), null);
      equal(parsed.a, "b");
      equal(api.parse("__proto__=1&__proto__=2").__proto__, ["1", "2"]);
      equal(api.parse("constructor=x&prototype=y&toString=z"), {
        constructor: "x",
        prototype: "y",
        toString: "z",
      });
      equal(api.parse("=v&&x"), { "": "v", x: "" });
      equal(api.parse(""), {});
    },
    parseLimits(api) {
      equal(api.parse("a=1&b=2&c=3", "&", "=", { maxKeys: 1.5 }), {
        a: "1",
        b: "2",
        c: "3",
      });
      // Duplicate pairs count against maxKeys; empty pairs consume the slot.
      equal(api.parse("a=1&a=2&b=3", null, null, { maxKeys: 2 }), {
        a: ["1", "2"],
      });
      equal(api.parse("&a=1&b=2", null, null, { maxKeys: 1 }), {});
      equal(api.parse("a=1&b=2", null, null, { maxKeys: 0 }), {
        a: "1",
        b: "2",
      });
      equal(api.parse("a=1&b=2", null, null, { maxKeys: 1000 }), {
        a: "1",
        b: "2",
      });
      equal(api.parse("a=1&b=2", null, null, { maxKeys: -1 }), {
        a: "1",
        b: "2",
      });
      equal(api.parse("a=1&b=2", null, null, { maxKeys: NaN }), {
        a: "1",
        b: "2",
      });
      equal(api.parse("a=1&b=2", null, null, { maxKeys: Infinity }), {
        a: "1",
        b: "2",
      });
      equal(
        api.parse("a=1&b=2&c=3", null, null, {
          maxKeys: "2" as unknown as number,
        }),
        {
          a: "1",
          b: "2",
          c: "3",
        },
      );
    },
    parseSeparators(api) {
      equal(api.parse("a=1;b=2", ";"), { a: "1", b: "2" });
      equal(api.parse("a=1&b=2", "", ""), { a: "1", b: "2" });
      equal(api.parse("x=%EF%BB%BFa"), { x: "\uFEFFa" });
      equal(api.parse("a=1;;b=2", ";;"), { a: "1", b: "2" });
      equal(api.parse("a::b::c", null, "::"), { a: "b::c" });
      equal(api.parse("a=b=c"), { a: "b=c" });
      equal(api.parse("a+b=c+d&e%20f=%2B"), { "a b": "c d", "e f": "+" });
      equal(api.parse("%F0%9F%8D%B7=wine"), { "🍷": "wine" });
      // Falsy sep/eq coerce to the defaults; other values stringify.
      equal(api.parse("a=1&b=2", 0 as unknown as string), { a: "1", b: "2" });
      equal(api.parse("a=1;b=2", 59 as unknown as string), { a: "1;b=2" });
      equal(api.parse("a:1&b:2", "&", ":"), { a: "1", b: "2" });
      equal(api.parse("a:b&c:d", "&", ":"), { a: "b", c: "d" });
      equal(api.parse("abc"), { abc: "" });
      equal(api.parse("a&b&c"), { a: "", b: "", c: "" });
      equal(api.parse("a&&b"), { a: "", b: "" });
    },
    parseMalformed(api) {
      for (const [value, expected] of [
        ["é%FF", "��"],
        ["🍷%FF", "<w�"],
        ["%C3é", "��"],
        ["%FFé", "��"],
      ]) {
        equal(api.parse(`x=${value}`), { x: expected });
        equal(api.unescape(value), expected);
      }
      equal(api.parse("x=\uD800"), { x: "\uD800" });
      // Malformed escapes stay literal or decode to U+FFFD; never throw.
      equal(api.parse("a=%E0%A4%A&b=%ZZ&c=%41"), {
        a: "�%A",
        b: "%ZZ",
        c: "A",
      });
      equal(api.parse("k=%u2603"), { k: "%u2603" });
      equal(api.parse("k=%ED%A0%80"), { k: "���" });
      equal(api.parse("k=abc%"), { k: "abc%" });
      equal(api.parse("k=%"), { k: "%" });
      equal(api.parse("k=%2"), { k: "%2" });
      // A BOM byte sequence that reaches the byte fallback decodes to
      // U+FEFF, not a stripped character.
      equal(api.parse("k=%EF%BB%BF%ZZ"), { k: "﻿%ZZ" });
      equal(api.unescape("%EF%BB%BF%ZZ"), "﻿%ZZ");
    },
    parseInputs(api) {
      // Non-string inputs produce an empty object, not an error.
      for (const input of [null, undefined, 123, true, {}, []]) {
        const parsed = api.parse(input);
        equal(Object.keys(parsed).length, 0);
      }
      equal(api.parse(["a=1"] as unknown as string), {});
      // Values only ever contain strings and string arrays.
      const parsed = api.parse("a=1&a=2&a=3");
      equal(Array.isArray(parsed.a), true);
      equal(parsed.a, ["1", "2", "3"]);
    },
    stringifyValues(api) {
      equal(
        api.stringify({ a: [1, "x"], b: null, c: undefined, d: true, e: {} }),
        "a=1&a=x&b=&c=&d=true&e=",
      );
      equal(
        api.stringify({ a: 0, b: -1, c: 1.5, n: NaN, i: Infinity }),
        "a=0&b=-1&c=1.5&n=&i=",
      );
      equal(api.stringify({ a: [[1, 2], 3] }), "a=&a=3");
      equal(api.stringify({ a: [] }), "");
      equal(api.stringify({ a: [], b: 1 }), "b=1");
      equal(
        api.stringify({ hasOwnProperty: 1, toString: 2 }),
        "hasOwnProperty=1&toString=2",
      );
      equal(api.stringify(null), "");
      equal(api.stringify(123), "");
      equal(api.stringify("str"), "");
      equal(api.stringify([1, 2]), "0=1&1=2");
      equal(api.stringify({ a: 1e21 }), "a=1e%2B21");
      equal(api.stringify({ a: 1e20 }), "a=100000000000000000000");
      equal(api.stringify({ a: 1n, b: 0n }), "a=1&b=0");
      equal(api.stringify({ a: { x: 1 }, f: () => 1 }), "a=&f=");
      equal(api.stringify({ "": 1 }), "=1");
      equal(api.stringify({ a: -1e21 }), "a=-1e%2B21");
    },
    stringifySeparators(api) {
      equal(api.stringify({ a: 1, b: 2 }, ";"), "a=1;b=2");
      equal(api.stringify({ a: 1, b: 2 }, ";", ":"), "a:1;b:2");
      // Falsy sep/eq fall back to '&'/'=', matching Workers.
      equal(api.stringify({ a: 1, b: 2 }, ""), "a=1&b=2");
      equal(api.stringify({ a: 1, b: 2 }, null, ""), "a=1&b=2");
      equal(api.stringify({ a: 1, b: 2 }, 0 as unknown as string), "a=1&b=2");
      equal(api.stringify({ a: 1, b: 2 }, "::"), "a=1::b=2");
      equal(api.stringify({ a: 1, b: 2 }, null, "=="), "a==1&b==2");
      equal(api.stringify({ "a b": "x y" }), "a%20b=x%20y");
      equal(api.stringify({ é: "🍷" }), "%C3%A9=%F0%9F%8D%B7");
    },
    escapeUnescape(api) {
      equal(
        api.escape(" !\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"),
        "%20!%22%23%24%25%26'()*%2B%2C-.%2F%3A%3B%3C%3D%3E%3F%40%5B%5C%5D%5E_%60%7B%7C%7D~",
      );
      equal(api.escape("🍷 a+b"), "%F0%9F%8D%B7%20a%2Bb");
      equal(api.escape("a\uD800b"), "a%F0%90%81%A2");
      equal(api.escape("é"), "%C3%A9");
      equal(api.escape(123), "123");
      equal(api.escape(1.5), "1.5");
      equal(api.escape(true), "true");
      equal(api.escape(null), "null");
      equal(api.escape(1n), "1");
      equal(api.escape({}), "%5Bobject%20Object%5D");
      equal(api.escape(["a", "b"]), "a%2Cb");
      equal(api.unescape("%F0%9F%8D%B7%20%41%42"), "🍷 AB");
      equal(api.unescape("a+b"), "a+b");
      equal(api.unescape("a%20b"), "a b");
      equal(api.unescape("a+b", true), "a+b");
      equal(api.unescape(123), "123");
      equal([...api.unescapeBuffer("é%FF+%41", true)], [233, 255, 32, 65]);
      equal([...api.unescapeBuffer("%ZZ+", false)], [37, 90, 90, 43]);
      equal(api.unescapeBuffer("abc") instanceof Uint8Array, true);
      throws(() => api.escape(Symbol("s")), { name: "TypeError" });
      throws(() => api.unescape(Symbol("s")), { name: "TypeError" });
      throws(() => api.escape("x\uD800"), {
        name: "URIError",
        code: "ERR_INVALID_URI",
      });
    },
    customCodecs(api) {
      equal(api.parse("x=%E0%A4%A", null, null, { decodeURIComponent }), {
        x: "�%A",
      });
      equal(
        api.stringify({ a: 1 }, undefined, undefined, {
          encodeURIComponent: 123 as unknown as (input: string) => string,
        }),
        "a=1",
      );
      const seen: string[] = [];
      equal(
        api.parse("a+b=c+d", null, null, {
          decodeURIComponent: (s: string) => (seen.push(s), `[${s}]`),
        }),
        { "[a%20b]": "[c%20d]" },
      );
      equal(seen, ["a%20b", "c%20d"]);
      // The custom decoder is not invoked for empty keys or values.
      seen.length = 0;
      equal(
        api.parse("a=&=x&b=y", null, null, {
          decodeURIComponent: (s: string) => (seen.push(s), s),
        }),
        { a: "", "": "x", b: "y" },
      );
      equal(seen, ["a", "x", "b", "y"]);
      equal(
        api.stringify({ "a b": "x y" }, null, null, {
          encodeURIComponent: (s: string) => `<${s}>`,
        }),
        "<a b>=<x y>",
      );
      // A throwing decoder falls back to the forgiving unescape.
      equal(
        api.parse("a=%41%20b", null, null, {
          decodeURIComponent: () => {
            throw new Error("boom");
          },
        }),
        { a: "A b" },
      );
    },
    aliases(api) {
      equal(api.decode === api.parse, true);
      equal(api.encode === api.stringify, true);
      equal(api.decode("x=1"), { x: "1" });
      equal(api.encode({ x: 1 }), "x=1");
      throws(() => api.escape("x\uD800"), { name: "URIError" });
    },
    shape(api) {
      for (const name of [
        "decode",
        "encode",
        "escape",
        "parse",
        "stringify",
        "unescape",
        "unescapeBuffer",
      ]) {
        equal(typeof api[name as keyof NodeQuerystringApi], "function", name);
      }
      // The default export carries the same seven members.
      equal(Object.keys(api.default ?? {}).sort(), [
        "decode",
        "encode",
        "escape",
        "parse",
        "stringify",
        "unescape",
        "unescapeBuffer",
      ]);
      equal(api.default?.parse === api.parse, true);
    },
  },
};

const supported = { status: "supported" } as const;

export class NodeQuerystring extends FeatureImplementation<
  typeof nodeQuerystringFeature
> {
  constructor() {
    super(nodeQuerystringFeature, {
      parseDuplicates: supported,
      parseLimits: supported,
      parseSeparators: supported,
      parseMalformed: supported,
      parseInputs: supported,
      stringifyValues: supported,
      stringifySeparators: supported,
      escapeUnescape: supported,
      customCodecs: supported,
      aliases: supported,
      shape: supported,
    });
  }
  create() {
    // workerd exposes unescapeBuffer, although @types/node omits it.
    return querystring as unknown as NodeQuerystringApi;
  }
}
