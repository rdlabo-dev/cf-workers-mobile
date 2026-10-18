import * as dns from "node:dns";
import * as promises from "node:dns/promises";
import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";
const api = { dns, promises };
function same(a: unknown, b: unknown) {
  if (a !== b) throw Error(`${String(a)} != ${String(b)}`);
}
function equal(a: unknown, b: unknown) {
  same(JSON.stringify(a), JSON.stringify(b));
}
async function fixture<T>(
  data: Record<string, string[]>,
  run: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    same(url.origin, "https://cloudflare-dns.com");
    same(url.pathname, "/dns-query");
    same(init?.method, "GET");
    same(new Headers(init?.headers).get("accept"), "application/dns-json");
    const type = url.searchParams.get("type")!,
      name = url.searchParams.get("name")!;
    return Response.json({
      Status: 0,
      Question: [{ name, type: 1 }],
      Answer: (data[type] ?? []).map((value) => ({
        name,
        type: 1,
        TTL: 30,
        data: value,
      })),
    });
  };
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}
export const dnsFeature = defineFeature<typeof api>()("node.dns", [
  "surface",
  "servers",
  "ordering",
  "addresses",
  "callback",
  "lookup",
  "names",
  "records",
  "caa",
  "naptr",
  "dispatch",
  "failures",
  "validation",
  "resolvers",
] as const);
export const dnsContract: ContractSuite<typeof dnsFeature> = {
  feature: dnsFeature,
  cases: {
    surface(api) {
      equal(Object.keys(api.dns).sort(), [
        "ADDRCONFIG",
        "ADDRGETNETWORKPARAMS",
        "ALL",
        "BADFAMILY",
        "BADFLAGS",
        "BADHINTS",
        "BADNAME",
        "BADQUERY",
        "BADRESP",
        "BADSTR",
        "CANCELLED",
        "CONNREFUSED",
        "DESTRUCTION",
        "EOF",
        "FILE",
        "FORMERR",
        "LOADIPHLPAPI",
        "NODATA",
        "NOMEM",
        "NONAME",
        "NOTFOUND",
        "NOTIMP",
        "NOTINITIALIZED",
        "REFUSED",
        "Resolver",
        "SERVFAIL",
        "TIMEOUT",
        "V4MAPPED",
        "default",
        "getDefaultResultOrder",
        "getServers",
        "lookup",
        "lookupService",
        "promises",
        "resolve",
        "resolve4",
        "resolve6",
        "resolveAny",
        "resolveCaa",
        "resolveCname",
        "resolveMx",
        "resolveNaptr",
        "resolveNs",
        "resolvePtr",
        "resolveSoa",
        "resolveSrv",
        "resolveTxt",
        "reverse",
        "setDefaultResultOrder",
        "setServers",
      ]);
      equal(Object.keys(api.promises).sort(), [
        "ADDRCONFIG",
        "ADDRGETNETWORKPARAMS",
        "ALL",
        "BADFAMILY",
        "BADFLAGS",
        "BADHINTS",
        "BADNAME",
        "BADQUERY",
        "BADRESP",
        "BADSTR",
        "CANCELLED",
        "CONNREFUSED",
        "DESTRUCTION",
        "EOF",
        "FILE",
        "FORMERR",
        "LOADIPHLPAPI",
        "NODATA",
        "NOMEM",
        "NONAME",
        "NOTFOUND",
        "NOTIMP",
        "NOTINITIALIZED",
        "REFUSED",
        "Resolver",
        "SERVFAIL",
        "TIMEOUT",
        "V4MAPPED",
        "default",
        "getDefaultResultOrder",
        "getServers",
        "lookup",
        "lookupService",
        "resolve",
        "resolve4",
        "resolve6",
        "resolveAny",
        "resolveCaa",
        "resolveCname",
        "resolveMx",
        "resolveNaptr",
        "resolveNs",
        "resolvePtr",
        "resolveSoa",
        "resolveSrv",
        "resolveTxt",
        "reverse",
        "setDefaultResultOrder",
        "setServers",
      ]);
      for (const [name, value] of Object.entries(api.promises)) {
        if (name !== "default") same((api.dns.promises as any)[name], value);
      }
      same(api.dns.NOTFOUND, "ENOTFOUND");
      same(api.dns.BADRESP, "EBADRESP");
      same(api.dns.BADQUERY, "EBADQUERY");
      same(typeof api.dns.Resolver, "function");
      same(typeof api.promises.Resolver, "function");
    },
    servers(api) {
      const expected = [
        "1.1.1.1",
        "2606:4700:4700::1111",
        "1.0.0.1",
        "2606:4700:4700::1001",
      ];
      equal(api.dns.getServers(), expected);
      equal(api.promises.getServers(), expected);
      api.dns.getServers().pop();
      equal(api.dns.getServers(), expected);
      for (const fn of [api.dns.setServers, api.promises.setServers]) {
        let error;
        try {
          fn([]);
        } catch (e) {
          error = e;
        }
        same((error as Error)?.message, "Not implemented");
      }
    },
    ordering(api) {
      const original = api.dns.getDefaultResultOrder();
      try {
        for (const order of ["ipv4first", "ipv6first", "verbatim"] as const) {
          api.dns.setDefaultResultOrder(order);
          same(api.promises.getDefaultResultOrder(), order);
        }
      } finally {
        api.dns.setDefaultResultOrder(original);
      }
    },
    async addresses(api) {
      await fixture({ A: ["192.0.2.1"], AAAA: ["2001:db8::1"] }, async () => {
        equal(await api.promises.resolve4("fixture.test"), ["192.0.2.1"]);
        equal(await api.promises.resolve4("fixture.test", { ttl: true }), [
          { ttl: 30, address: "192.0.2.1" },
        ]);
        equal(await api.promises.resolve6("fixture.test", { ttl: true }), [
          { ttl: 30, address: "2001:db8::1" },
        ]);
      });
    },
    async callback(api) {
      await fixture({ A: ["192.0.2.1"] }, async () => {
        let sync = true;
        const value = new Promise((resolve, reject) => {
          same(
            api.dns.resolve4("fixture.test", (error, values) => {
              same(sync, false);
              if (error) reject(error);
              else resolve(values);
            }),
            undefined,
          );
        });
        sync = false;
        equal(await value, ["192.0.2.1"]);
      });
    },
    async lookup(api) {
      equal(await api.promises.lookup("192.0.2.1"), {
        address: "192.0.2.1",
        family: 4,
      });
      equal(await api.promises.lookup("2001:db8::1", { all: true }), [
        { address: "2001:db8::1", family: 6 },
      ]);
      await fixture({ A: ["192.0.2.1"], AAAA: ["2001:db8::1"] }, async () => {
        equal(
          await api.promises.lookup("fixture.test", {
            all: true,
            order: "ipv6first",
          }),
          [
            { address: "2001:db8::1", family: 6 },
            { address: "192.0.2.1", family: 4 },
          ],
        );
        equal(await api.promises.lookup("fixture.test", { family: 4 }), {
          address: "192.0.2.1",
          family: 4,
        });
      });
    },
    async names(api) {
      await fixture(
        { CNAME: ["canonical.test."], NS: ["ns.test."], PTR: ["ptr.test."] },
        async () => {
          equal(await api.promises.resolveCname("fixture.test"), [
            "canonical.test",
          ]);
          equal(await api.promises.resolveNs("fixture.test"), ["ns.test"]);
          equal(await api.promises.resolvePtr("fixture.test"), ["ptr.test"]);
          equal(await api.promises.reverse("192.0.2.1"), ["ptr.test"]);
        },
      );
    },
    async records(api) {
      await fixture(
        {
          MX: ["10 mail.test."],
          TXT: ['"one""two"'],
          SRV: ["5 2 443 service.test"],
          SOA: ["ns.test. host.test. 1 2 3 4 5"],
        },
        async () => {
          equal(await api.promises.resolveMx("fixture.test"), [
            { exchange: "mail.test", priority: 10 },
          ]);
          equal(await api.promises.resolveTxt("fixture.test"), [
            ["one", "two"],
          ]);
          equal(await api.promises.resolveSrv("fixture.test"), [
            { priority: 5, weight: 2, port: 443, name: "service.test" },
          ]);
          equal(await api.promises.resolveSoa("fixture.test"), {
            nsname: "ns.test.",
            hostmaster: "host.test.",
            serial: 1,
            refresh: 2,
            retry: 3,
            expire: 4,
            minttl: 5,
          });
        },
      );
    },
    async caa(api) {
      for (const record of [
        '0 issue "pki.goog"',
        "\\# 15 00 05 69 73 73 75 65 70 6b 69 2e 67 6f 6f 67",
      ])
        await fixture({ CAA: [record] }, async () =>
          equal(await api.promises.resolveCaa("fixture.test"), [
            { critical: 0, issue: "pki.goog" },
          ]),
        );
      await fixture({ CAA: ['128 iodef "mailto:a\\032b@test"'] }, async () =>
        equal(await api.promises.resolveCaa("fixture.test"), [
          { critical: 128, iodef: "mailto:a b@test" },
        ]),
      );
    },
    async naptr(api) {
      await fixture(
        { NAPTR: ['20 100 "s" "SIP+D2U" "" _sip._udp.sip2sip.info.'] },
        async () =>
          equal(await api.promises.resolveNaptr("fixture.test"), [
            {
              flags: "s",
              service: "SIP+D2U",
              regexp: "",
              replacement: "_sip._udp.sip2sip.info",
              order: 20,
              preference: 100,
            },
          ]),
      );
    },
    async dispatch(api) {
      await fixture({ A: ["192.0.2.1"] }, async () =>
        equal(await api.promises.resolve("fixture.test", "A"), ["192.0.2.1"]),
      );
      for (const fn of [
        () => api.promises.resolveAny("fixture.test"),
        () => api.promises.lookupService("192.0.2.1", 80),
      ]) {
        let error;
        try {
          await fn();
        } catch (e) {
          error = e;
        }
        same((error as Error)?.message, "Not implemented");
      }
    },
    async failures(api) {
      const original = globalThis.fetch;
      try {
        for (const mode of ["http", "network", "missing"]) {
          globalThis.fetch = async () => {
            if (mode === "network") throw Error("network");
            if (mode === "http") return new Response("", { status: 500 });
            return Response.json({ Question: [{}] });
          };
          let error: any;
          try {
            await api.promises.resolve4("fixture.test");
          } catch (e) {
            error = e;
          }
          same(error.hostname, "fixture.test");
          same(error.syscall, "queryA");
          same(
            error.code,
            mode === "http"
              ? "EBADRESP"
              : mode === "network"
                ? "EBADQUERY"
                : "ENOTFOUND",
          );
          same(error.errno, undefined);
        }
      } finally {
        globalThis.fetch = original;
      }
    },
    validation(api) {
      for (const fn of [
        () => api.promises.resolve4(1 as never),
        () => api.dns.setDefaultResultOrder("invalid" as never),
        () => api.dns.lookup("fixture.test", { family: 8 }, () => {}),
      ]) {
        let error: any;
        try {
          fn();
        } catch (e) {
          error = e;
        }
        same(typeof error?.code, "string");
      }
    },
    async resolvers(api) {
      for (const resolver of [
        new api.dns.Resolver(),
        new api.promises.Resolver(),
      ]) {
        equal(resolver.getServers(), api.dns.getServers());
        for (const fn of [
          () => resolver.cancel(),
          () => resolver.setLocalAddress("192.0.2.1"),
        ]) {
          let error;
          try {
            fn();
          } catch (e) {
            error = e;
          }
          same((error as Error)?.message, "Not implemented");
        }
      }
      await fixture({ A: ["192.0.2.1"] }, async () =>
        equal(await new api.promises.Resolver().resolve4("fixture.test"), [
          "192.0.2.1",
        ]),
      );
    },
  },
};
export class DnsImplementation extends FeatureImplementation<
  typeof dnsFeature
> {
  constructor() {
    super(
      dnsFeature,
      Object.fromEntries(
        dnsFeature.cases.map((name) => [name, { status: "supported" }]),
      ) as never,
    );
  }
  create() {
    return api;
  }
}
