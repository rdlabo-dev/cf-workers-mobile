import * as https from "node:https";
import * as http from "node:http";
import {
  defineFeature,
  FeatureImplementation,
} from "workers-capacitor/shared/contracts";
import type { ContractSuite } from "workers-capacitor/shared/contracts/testing";
const api = https as unknown as typeof import("./index.js");
function same(a: unknown, b: unknown) {
  if (a !== b) throw Error(`${String(a)} != ${String(b)}`);
}
function equal(a: unknown, b: unknown) {
  same(JSON.stringify(a), JSON.stringify(b));
}
export const httpsFeature = defineFeature<typeof api>()("node.https", [
  "surface",
  "agent",
  "agentOptions",
  "agentName",
  "globalAgent",
  "requests",
  "requestOptions",
  "protocol",
  "server",
  "tlsMethods",
] as const);
export const httpsContract: ContractSuite<typeof httpsFeature> = {
  feature: httpsFeature,
  cases: {
    surface(api) {
      const names = [
        "get",
        "request",
        "Agent",
        "globalAgent",
        "createServer",
        "Server",
      ];
      equal(Object.keys(api).sort(), [...names, "default"].sort());
      equal(Object.keys(api.default).sort(), names.sort());
      for (const name of names)
        same((api.default as any)[name], (api as any)[name]);
    },
    agent(api) {
      const agent = new api.Agent();
      same(agent instanceof http.Agent, true);
      same(agent.defaultPort, 443);
      same(agent.protocol, "https:");
      same(agent.maxCachedSessions, 100);
      same(agent.options.defaultPort, 443);
      same(agent.options.protocol, "https:");
    },
    agentOptions(api) {
      const options = {
        defaultPort: 8443,
        protocol: "custom:",
        keepAlive: true,
      };
      const agent = new api.Agent(options);
      same(agent.defaultPort, 8443);
      same(agent.protocol, "custom:");
      same(agent.options === options, false);
      equal(options, {
        defaultPort: 8443,
        protocol: "custom:",
        keepAlive: true,
      });
    },
    agentName(api) {
      const agent = new api.Agent();
      const options = {
        host: "a.test",
        port: 443,
        ca: "ca",
        cert: "cert",
        clientCertEngine: "engine",
        ciphers: "ciphers",
        key: "key",
        pfx: "pfx",
        rejectUnauthorized: false,
        servername: "s.test",
        minVersion: "TLSv1.2",
        maxVersion: "TLSv1.3",
        secureProtocol: "proto",
        crl: "crl",
        honorCipherOrder: true,
        ecdhCurve: "curve",
        dhparam: "dh",
        secureOptions: 1,
        sessionIdContext: "id",
        sigalgs: "sig",
        privateKeyIdentifier: "identifier",
        privateKeyEngine: "private",
      };
      same(
        agent.getName(options as never),
        new http.Agent().getName(options) +
          ':ca:cert:engine:ciphers:key:pfx:false:s.test:TLSv1.2:TLSv1.3:proto:crl:true:curve:dh:1:id:"sig":identifier:private',
      );
      same(
        agent.getName({ host: "a", servername: "a" }),
        new http.Agent().getName({ host: "a" }) + ":".repeat(20),
      );
    },
    globalAgent(api) {
      same(api.globalAgent instanceof api.Agent, true);
      same(api.globalAgent.keepAlive, true);
      same(api.globalAgent.scheduling, "lifo");
      same(api.globalAgent.options.timeout, 5000);
    },
    requests(api) {
      for (const input of [
        "https://example.test/a?q=1",
        new URL("https://example.test/a?q=1"),
      ]) {
        const request = api.request(input);
        request.on("error", () => {});
        try {
          same(request instanceof http.ClientRequest, true);
          same(request.agent, api.globalAgent);
          same(request.protocol, "https:");
          same(request.path, "/a?q=1");
          same(request.getHeader("host"), "example.test");
        } finally {
          request.destroy();
        }
      }
    },
    requestOptions(api) {
      const options = {
        hostname: "example.test",
        path: "/custom",
        method: "POST",
        agent: false,
      };
      const request = api.request(options as never);
      request.on("error", () => {});
      try {
        same(request.agent instanceof api.Agent, true);
        same(request.agent === api.globalAgent, false);
        same(request.method, "POST");
        same(request.path, "/custom");
        same("_defaultAgent" in options, false);
      } finally {
        request.destroy();
      }
    },
    protocol(api) {
      for (const input of [
        "http://example.test/",
        { protocol: "http:", hostname: "example.test" },
      ]) {
        let error;
        try {
          api.request(input);
        } catch (e) {
          error = e;
        }
        same((error as any)?.code, "ERR_INVALID_PROTOCOL");
      }
      const request = api.request("http://example.test/", {
        agent: http.globalAgent,
      });
      request.on("error", () => {});
      same(request.agent, http.globalAgent);
      request.destroy();
    },
    server(api) {
      const handler = () => {};
      const server = api.createServer({}, handler);
      same(server instanceof api.Server, true);
      same(server instanceof http.Server, true);
      same(server.listeners("request").includes(handler), true);
      same(Object.getPrototypeOf(api.Server.prototype), http.Server.prototype);
    },
    tlsMethods(api) {
      const server = new api.Server();
      for (const name of [
        "addContext",
        "getTicketKeys",
        "setSecureContext",
        "setTicketKeys",
      ] as const) {
        let error;
        try {
          server[name]();
        } catch (e) {
          error = e;
        }
        same((error as any)?.code, "ERR_METHOD_NOT_IMPLEMENTED");
        same(
          (error as Error)?.message,
          `The ${name} method is not implemented`,
        );
      }
    },
  },
};
export class HttpsImplementation extends FeatureImplementation<
  typeof httpsFeature
> {
  constructor() {
    super(
      httpsFeature,
      Object.fromEntries(
        httpsFeature.cases.map((name) => [name, { status: "supported" }]),
      ) as never,
    );
  }
  create() {
    return api;
  }
}
