import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";
import type { Headers as LocalHeaders } from "./index.js";

type HeaderConstructor = typeof LocalHeaders;
const equal = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
};
function throws(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    if (error instanceof TypeError) return;
    throw error;
  }
  throw new Error("Expected TypeError");
}
export const headersFeature = defineFeature<HeaderConstructor>()(
  "web.headers",
  [
    "construction",
    "mutation",
    "cookies",
    "utf8",
    "iteration",
    "snapshotIteration",
    "validation",
    "receivers",
  ],
);
export const headersContract: ContractSuite<typeof headersFeature> = {
  feature: headersFeature,
  cases: {
    construction(Header) {
      equal(Header.length, 0);
      equal([...new Header()], []);
      let reads = 0;
      const input = {
        get [Symbol.iterator]() {
          reads++;
          return function* () {
            yield ["x", "a"];
          };
        },
      };
      equal([...new Header(input)], [["x", "a"]]);
      equal(reads, 1);
      const pair = Object.assign(function pair() {}, {
        *[Symbol.iterator]() {
          yield "x";
          yield "a";
        },
      });
      equal([...new Header([pair])], [["x", "a"]]);
      equal(
        [...new Header({ Z: " z ", a: "a" })],
        [
          ["a", "a"],
          ["z", "z"],
        ],
      );
      const original = new Header([
        ["x", "a"],
        ["X", "b"],
      ]);
      const copy = new Header(original);
      original.set("x", "changed");
      equal(copy.get("x"), "a, b");
      for (const iterator of [null, undefined]) {
        equal(
          [...new Header({ x: "a", [Symbol.iterator]: iterator } as never)],
          [["x", "a"]],
        );
      }
      class Derived extends Header {
        override append(): never {
          throw new Error("Unexpected public append");
        }
      }
      equal(new Derived({ x: "a" }).get("x"), "a");
    },
    mutation(Header) {
      const h = new Header();
      equal(h.get("x"), null);
      equal(h.has("x"), false);
      equal(h.append("X", " a "), undefined);
      h.append("x", "b");
      equal(h.get("X"), "a, b");
      equal(h.has("x"), true);
      equal(h.set("x", ""), undefined);
      equal(h.get("x"), "");
      equal(h.delete("X"), undefined);
      equal(h.has("x"), false);
    },
    cookies(Header) {
      const h = new Header([
        ["Set-Cookie", "a=1; Expires=Wed, 21 Oct 2037 07:28:00 GMT"],
        ["set-cookie", "b=2"],
      ]);
      const cookies = h.getAll("SET-COOKIE");
      equal(h.getSetCookie(), cookies);
      equal(h.get("set-cookie"), cookies.join(", "));
      equal(
        [...h],
        cookies.map((v) => ["set-cookie", v]),
      );
      cookies.pop();
      equal(h.getSetCookie().length, 2);
      for (const key of ["x", " set-cookie ", ""]) throws(() => h.getAll(key));
      h.set("set-cookie", "c=3");
      equal(h.getSetCookie(), ["c=3"]);
      h.delete("set-cookie");
      equal(h.getSetCookie(), []);
    },
    utf8(Header) {
      equal(new Header({ x: "日本語🍷" }).get("x"), "日本語🍷");
      const names = new Header({ "": "empty", Ä: "a", ä: "b", "🍷": "wine" });
      equal(
        [...names],
        [
          ["", "empty"],
          ["�", "a"],
          ["�", "b"],
          ["🍷", "wine"],
        ],
      );
      equal(names.get("Ä"), "a");
      equal(names.get("ä"), "b");
      const copy = new Header(names);
      equal(copy.get("Ä"), "a");
      equal(copy.get("ä"), "b");
      names.set("Ä", "changed");
      equal(copy.get("Ä"), "a");
      equal(new Header({ x: "\ud800" }).get("x"), "���");
      equal(new Header({ x: "\r\n\t a \r\n" }).get("x"), "a");
    },
    iteration(Header) {
      const h = new Header({ b: "2", a: "1" });
      equal([...h.keys()], ["a", "b"]);
      equal([...h.values()], ["1", "2"]);
      equal([...h.entries()], [...h]);
      const values: unknown[] = [];
      const receiver = {};
      h.forEach(function (this: unknown, v, k, parent) {
        equal(this === receiver, true);
        equal(parent === h, true);
        values.push([k, v]);
      }, receiver);
      equal(values, [...h]);
      h.entries = () => {
        throw new Error("Unexpected public entries");
      };
      const snapshot: unknown[] = [];
      h.forEach((v, k) => snapshot.push([k, v]));
      equal(snapshot, [
        ["a", "1"],
        ["b", "2"],
      ]);
      equal([...h], snapshot);
      h.getSetCookie = () => {
        throw new Error("Unexpected public getSetCookie");
      };
      equal(h.getAll("set-cookie"), []);
    },
    snapshotIteration(Header) {
      const h = new Header({ a: "1", b: "2" });
      const iterator = h.entries();
      equal(iterator.next().value, ["a", "1"]);
      h.set("c", "3");
      equal(iterator.next().value, ["b", "2"]);
      equal(iterator.next().done, true);
      equal(iterator.next().done, true);
    },
    validation(Header) {
      for (const bad of [null, 1, "x", [["a", "b", "c"]]])
        throws(() => new Header(bad as never));
      for (const key of ["x y", "x\n", ":"]) {
        const h = new Header();
        for (const fn of [
          () => h.get(key),
          () => h.has(key),
          () => h.delete(key),
          () => h.set(key, "v"),
          () => h.append(key, "v"),
        ])
          throws(fn);
      }
      for (const v of ["a\nb", "a\rb", "a\0b"])
        throws(() => new Header({ x: v }));
      throws(() => new Header().forEach(null as never));
      const h = new Header();
      for (const method of [
        "get",
        "has",
        "delete",
        "getAll",
        "set",
        "append",
      ] as const)
        throws(() => Reflect.apply(h[method], h, []));
    },
    receivers(Header) {
      const h = new Header();
      for (const fn of [
        () => h.get.call({} as never, "x"),
        () => h.set.call({} as never, "x", "v"),
        () => h.getSetCookie.call({} as never),
      ])
        throws(fn);
      equal(Object.prototype.toString.call(h), "[object Headers]");
    },
  },
};
export class HeadersImplementation extends FeatureImplementation<
  typeof headersFeature
> {
  constructor(private readonly Header: HeaderConstructor) {
    super(headersFeature, {
      construction: { status: "supported" },
      mutation: { status: "supported" },
      cookies: { status: "supported" },
      utf8: { status: "supported" },
      iteration: { status: "supported" },
      snapshotIteration: { status: "supported" },
      validation: { status: "supported" },
      receivers: { status: "supported" },
    });
  }
  create() {
    return this.Header;
  }
}
