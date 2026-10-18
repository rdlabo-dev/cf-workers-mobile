import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";
import type { Response as LocalResponse } from "./index.js";
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
  throw new Error(`Expected ${name}`);
}
export const responseFeature = defineFeature<typeof LocalResponse>()(
  "web.response",
  [
    "construction",
    "status",
    "nullBody",
    "body",
    "clone",
    "statics",
    "cf",
    "validation",
  ],
);
export const responseContract: ContractSuite<typeof responseFeature> = {
  feature: responseFeature,
  cases: {
    construction(Response) {
      equal(new Response(null, null as never).status, 200);
      throws(() => new Response(null, "x" as never));
      const r = new Response();
      equal(r.status, 200);
      equal(r.statusText, "OK");
      equal(r.type, "default");
      equal(r.url, "");
      equal(r.redirected, false);
      equal(r.webSocket, null);
      equal(r.cf, undefined);
      equal(r.body, null);
      equal(r.bodyUsed, false);
      equal(r.ok, true);
      equal(Object.prototype.toString.call(r), "[object Response]");
    },
    status(Response) {
      throws(() => new Response(null, { statusText: Symbol("s") as never }));
      for (const [status, text] of [
        [201, "Created"],
        [299, "Successful"],
        [399, "Redirection"],
        [499, "Client Error"],
        [599, "Server Error"],
      ] as const)
        equal(new Response(null, { status }).statusText, text);
      equal(
        new Response(null, { status: 201, statusText: "日本語" }).statusText,
        "日本語",
      );
      for (const status of [0, 101, 199, 600])
        throws(() => new Response(null, { status }), "RangeError");
    },
    nullBody(Response) {
      for (const status of [204, 205, 304]) {
        equal(new Response(null, { status }).body, null);
        equal(new Response("", { status }).body, null);
        equal(new Response(new Uint8Array(0), { status }).body, null);
        throws(() => new Response("x", { status }));
        throws(() => new Response(new ReadableStream(), { status }));
      }
    },
    async body(Response) {
      const r = new Response("日本語");
      equal(r.headers.get("content-type"), "text/plain;charset=UTF-8");
      equal(await r.text(), "日本語");
      equal(r.bodyUsed, true);
      equal(
        [...(await new Response(new Uint8Array([0, 255, 1])).bytes())],
        [0, 255, 1],
      );
      equal(await new Response("\ufeffhello").text(), "hello");
      equal(await new Response('{"a":1}').json(), { a: 1 });
      const form = new Response("x=1&x=2", {
        headers: { "content-type": "application/x-www-form-urlencoded" },
      });
      equal(
        [...(await form.formData()).entries()],
        [
          ["x", "1"],
          ["x", "2"],
        ],
      );
    },
    async clone(Response) {
      const r = new Response("hello", { status: 201, headers: { x: "one" } });
      const clone = r.clone();
      r.headers.set("x", "two");
      equal(clone.headers.get("x"), "one");
      equal(clone.status, 201);
      equal(await r.text(), "hello");
      equal(await clone.text(), "hello");
      throws(() => r.clone());
    },
    async statics(Response) {
      const error = Response.error();
      equal(error.status, 0);
      equal(error.statusText, "");
      equal(error.type, "error");
      equal(error.ok, false);
      equal(error.clone().type, "error");
      equal(Response.redirect("https://a/", "301" as never).status, 301);
      const redirect = Response.redirect("https://example.com:443/a");
      equal(redirect.status, 302);
      equal(redirect.headers.get("location"), "https://example.com/a");
      throws(() => redirect.headers.set("x", "a"));
      throws(() => redirect.clone().headers.append("x", "a"));
      throws(() => Response.redirect("/a"));
      throws(() => Response.redirect("https://a/", 200), "RangeError");
      const json = Response.json({ a: 1 }, { status: 201 });
      equal(json.status, 201);
      equal(json.headers.get("content-type"), "application/json");
      equal(await json.json(), { a: 1 });
      const asInit = new Response(null, { status: 202, headers: { x: "a" } });
      equal(Response.json({}, asInit).status, 202);
      equal(await Response.json(undefined).text(), "undefined");
    },
    cf(Response) {
      for (const cf of [null, 1, "x", true])
        throws(() => new Response(null, { cf: cf as never }).cf);
      throws(
        () => new Response(null, { cf: (() => {}) as never }).cf,
        "SyntaxError",
      );
      throws(
        () => new Response(null, { cf: new Date(0) as never }).cf,
        "Error",
      );
      const cycle: Record<string, unknown> = {};
      cycle.self = cycle;
      throws(() => new Response(null, { cf: cycle }).cf);
      throws(() => new Response(null, { cf: { big: 1n } }).cf);
      equal(
        new Response(null, {
          cf: { fn() {}, u: undefined, date: new Date(0), n: NaN },
        }).cf,
        { date: "1970-01-01T00:00:00.000Z", n: null },
      );
      const cf = { nested: { value: 1 } };
      const r = new Response(null, { cf });
      cf.nested.value = 2;
      equal(r.cf, { nested: { value: 1 } });
      const clone = r.clone();
      (clone.cf!.nested as { value: number }).value = 3;
      equal(r.cf, { nested: { value: 1 } });
      equal(new Response(null, r).cf, r.cf);
    },
    validation(Response) {
      for (const statusText of ["a\nb", "a\rb", "\t", "\0"])
        throws(() => new Response(null, { statusText }));
      throws(() => new Response(null, { encodeBody: "invalid" as never }));
      throws(() => new Response(null, { webSocket: {} as never }));
    },
  },
};
export class ResponseImplementation extends FeatureImplementation<
  typeof responseFeature
> {
  constructor(private readonly Response: typeof LocalResponse) {
    super(responseFeature, {
      construction: { status: "supported" },
      status: { status: "supported" },
      nullBody: { status: "supported" },
      body: { status: "supported" },
      clone: { status: "supported" },
      statics: { status: "supported" },
      cf: { status: "supported" },
      validation: { status: "supported" },
    });
  }
  create() {
    return this.Response;
  }
}
