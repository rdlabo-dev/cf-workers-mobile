import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";
import type { Request as LocalRequest } from "./index.js";
const equal = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
};
function throws(fn: () => unknown, name = "TypeError") {
  try {
    fn();
  } catch (e) {
    if (e instanceof Error && e.name === name) return;
    throw e;
  }
  throw new Error("Expected TypeError");
}
export const requestFeature = defineFeature<typeof LocalRequest>()(
  "web.request",
  [
    "construction",
    "methods",
    "options",
    "headers",
    "body",
    "clone",
    "signals",
    "cf",
  ],
);
export const requestContract: ContractSuite<typeof requestFeature> = {
  feature: requestFeature,
  cases: {
    construction(Request) {
      equal(new Request("https://a/", null as never).method, "GET");
      throws(() => new Request("https://a/", "x" as never));
      const r = new Request("https://u:p@example.com:443/a#hash");
      equal(r.url, "https://u:p@example.com/a#hash");
      equal(r.method, "GET");
      equal(r.redirect, "follow");
      equal(r.fetcher, null);
      equal(r.cache, undefined);
      equal(r.integrity, "");
      equal(r.keepalive, false);
      equal(r.body, null);
      equal(r.bodyUsed, false);
      throws(() => new Request("/relative"));
    },
    methods(Request) {
      for (const method of "ACL CHECKOUT COPY DELETE GET HEAD LOCK MERGE MKACTIVITY MKCOL MOVE NOTIFY OPTIONS PATCH POST PROPFIND PROPPATCH PURGE PUT QUERY REPORT SEARCH SUBSCRIBE TRACE UNLOCK UNSUBSCRIBE".split(
        " ",
      )) {
        equal(new Request("https://a/", { method }).method, method);
        equal(
          new Request("https://a/", { method: method.toLowerCase() }).method,
          method,
        );
      }
      for (const method of [
        "CONNECT",
        "BIND",
        "LINK",
        "M-SEARCH",
        "MKCALENDAR",
        "REBIND",
        "SOURCE",
        "UNBIND",
        "UNLINK",
        "foo",
        "",
      ])
        throws(() => new Request("https://a/", { method }));
    },
    options(Request) {
      for (const cache of ["no-store", "no-cache"])
        equal(new Request("https://a/", { cache }).cache, cache);
      for (const cache of [
        "reload",
        "default",
        "force-cache",
        "only-if-cached",
      ])
        throws(() => new Request("https://a/", { cache }));
      equal(
        new Request("https://a/", { redirect: "MANUAL" }).redirect,
        "manual",
      );
      throws(() => new Request("https://a/", { redirect: "error" }));
      throws(() => new Request("https://a/", { integrity: "sha256-a" }));
      equal(new Request("https://a/", { keepalive: true }).keepalive, false);
      throws(
        () => new Request("https://a/", { encodeResponseBody: "bad" as never }),
      );
    },
    headers(Request) {
      const r = new Request("https://a/", {
        headers: {
          "x-unicode": "日本語",
          host: "custom.example",
          cookie: "a=1",
        },
      });
      equal(r.headers.get("x-unicode"), "日本語");
      equal(r.headers.get("host"), "custom.example");
      equal(r.headers.get("cookie"), "a=1");
      r.headers.append("x", "a");
      equal(r.headers.get("x"), "a");
    },
    async body(Request) {
      const r = new Request("https://a/", { method: "POST", body: "日本語" });
      equal(r.headers.get("content-type"), "text/plain;charset=UTF-8");
      const moved = new Request(r);
      equal(r.bodyUsed, true);
      equal(r.body?.locked, true);
      equal(await moved.text(), "日本語");
      equal(moved.bodyUsed, true);
      throws(() => new Request("https://a/", { body: "x" }));
      const original = new Request("https://a/", {
        method: "POST",
        body: "body",
      });
      const removed = new Request(original, { body: null });
      equal(removed.body, null);
      equal(original.bodyUsed, false);
    },
    async clone(Request) {
      const r = new Request("https://a/", {
        method: "POST",
        body: "hello",
        headers: { x: "a" },
      });
      const clone = r.clone();
      r.headers.set("x", "b");
      equal(clone.headers.get("x"), "a");
      equal(await r.text(), "hello");
      equal(await clone.text(), "hello");
      throws(() => r.clone());
    },
    signals(Request) {
      const controller = new AbortController();
      const r = new Request("https://a/", { signal: controller.signal });
      equal(r.signal === controller.signal, true);
      equal(r.clone().signal === controller.signal, true);
      controller.abort("reason");
      equal(r.signal.reason, "reason");
      const plain = new Request("https://a/");
      equal(plain.signal === plain.signal, true);
      equal(plain.clone().signal === plain.signal, false);
      equal(new Request(r, { signal: null }).signal.aborted, false);
    },
    cf(Request) {
      for (const cf of [null, 1, "x", true])
        throws(() => new Request("https://a/", { cf: cf as never }).cf);
      throws(
        () => new Request("https://a/", { cf: (() => {}) as never }).cf,
        "SyntaxError",
      );
      throws(
        () => new Request("https://a/", { cf: new Date(0) as never }).cf,
        "Error",
      );
      const original = new Request("https://a/", {
        method: "POST",
        body: "abc",
      });
      throws(() => new Request(original, { cf: null as never }));
      equal(original.bodyUsed, false);
      equal(original.body?.locked, false);
      const cycle: Record<string, unknown> = {};
      cycle.self = cycle;
      throws(() => new Request("https://a/", { cf: cycle }).cf);
      throws(() => new Request("https://a/", { cf: { big: 1n } }).cf);
      equal(
        new Request("https://a/", {
          cf: { fn() {}, u: undefined, date: new Date(0), n: NaN },
        }).cf,
        { date: "1970-01-01T00:00:00.000Z", n: null },
      );
      const cf = { nested: { value: 1 } };
      const r = new Request("https://a/", { cf });
      cf.nested.value = 2;
      equal(r.cf, { nested: { value: 1 } });
      const clone = r.clone();
      (clone.cf!.nested as { value: number }).value = 3;
      equal(r.cf, { nested: { value: 1 } });
    },
  },
};
export class RequestImplementation extends FeatureImplementation<
  typeof requestFeature
> {
  constructor(private readonly Request: typeof LocalRequest) {
    super(requestFeature, {
      construction: { status: "supported" },
      methods: { status: "supported" },
      options: { status: "supported" },
      headers: { status: "supported" },
      body: { status: "supported" },
      clone: { status: "supported" },
      signals: { status: "supported" },
      cf: { status: "supported" },
    });
  }
  create() {
    return this.Request;
  }
}
