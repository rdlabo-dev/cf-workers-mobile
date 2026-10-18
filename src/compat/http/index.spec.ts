import http from "node:http";
import {
  Agent,
  ClientRequest,
  IncomingMessage,
  OutgoingMessage,
  Server,
  ServerResponse,
  createServer,
  get,
  globalAgent,
  maxHeaderSize,
  request,
  setMaxIdleHTTPParsers,
} from "node:http";
import * as cloudflareNode from "cloudflare:node";
const {
  connectHandler,
  handleAsNodeConnection,
  handleAsNodeRequest,
  httpServerHandler,
} = cloudflareNode as unknown as typeof import("../cloudflare-node/index.js");
import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";

const api = {
  module: http,
  bridge: cloudflareNode,
  Agent,
  ClientRequest,
  IncomingMessage,
  OutgoingMessage,
  Server,
  ServerResponse,
  createServer,
  get,
  globalAgent,
  maxHeaderSize,
  request,
  setMaxIdleHTTPParsers,
  connectHandler,
  handleAsNodeConnection,
  httpServerHandler,
  handleAsNodeRequest,
};
export const nodeHttpFeature = defineFeature<typeof api>()("node.http", [
  "serverDescriptor",
  "portDescriptors",
  "invalidDescriptor",
  "ephemeralPorts",
  "closeLifecycle",
  "streamResponse",
  "streamRequest",
  "asyncFailure",
  "dispatchContext",
  "moduleSurface",
  "outgoingHeaders",
  "agentStubs",
  "clientRequestResponse",
  "clientGet",
  "clientValidation",
  "clientDestroy",
  "clientResponseTimeout",
  "tcpBridgeMissingListener",
]);
function equal(value: unknown, expected: unknown) {
  if (JSON.stringify(value) !== JSON.stringify(expected))
    throw new Error(`${JSON.stringify(value)} != ${JSON.stringify(expected)}`);
}
async function rejects(
  operation: () => unknown,
  code?: string,
  message?: string,
) {
  try {
    await operation();
  } catch (error) {
    if (code) equal((error as { code?: string }).code, code);
    if (message) equal((error as Error).message, message);
    return;
  }
  throw new Error("Expected rejection");
}
// The receiving contract is completion evidence, not a declaration that the
// entire node:http module is supported. Client APIs still need their contracts.
export const nodeHttpContract: ContractSuite<typeof nodeHttpFeature> = {
  feature: nodeHttpFeature,
  cases: {
    async serverDescriptor({ createServer, httpServerHandler }) {
      const server = createServer((req, res) => res.end(req.url));
      try {
        const handler = httpServerHandler(server);
        equal(server.listening, true);
        equal(
          await (
            await handler.fetch(new Request("https://example.test/path?q=1"))
          ).text(),
          "/path?q=1",
        );
        const first = server.address();
        httpServerHandler(server);
        equal(server.address(), first);
      } finally {
        server.close();
      }
    },
    async portDescriptors({
      createServer,
      httpServerHandler,
      handleAsNodeRequest,
    }) {
      const server = createServer((_req, res) => res.end("ok")).listen();
      const port = (server.address() as { port: number }).port;
      try {
        for (const descriptor of [port, { port }]) {
          equal(
            await (
              await httpServerHandler(descriptor).fetch(
                new Request("https://example.test/"),
              )
            ).text(),
            "ok",
          );
          equal(
            await (
              await handleAsNodeRequest(
                descriptor,
                new Request("https://example.test/"),
              )
            ).text(),
            "ok",
          );
        }
      } finally {
        server.close();
      }
      await rejects(
        () => handleAsNodeRequest(port, new Request("https://example.test/")),
        "ERR_INVALID_ARG_VALUE",
      );
    },
    async invalidDescriptor({ httpServerHandler, handleAsNodeRequest }) {
      for (const descriptor of [-1, 65536, NaN, Infinity, {}, { port: null }]) {
        await rejects(() => httpServerHandler(descriptor));
        await rejects(() =>
          handleAsNodeRequest(descriptor, new Request("https://example.test/")),
        );
      }
      await rejects(() => httpServerHandler(null!));
      httpServerHandler(1.5);
    },
    async ephemeralPorts({ createServer }) {
      const a = createServer().listen(),
        b = createServer().listen(0);
      try {
        const first = a.address() as { port: number };
        const second = b.address() as { port: number };
        equal(first.port !== second.port, true);
        equal(first.port >= 49152 && second.port <= 65535, true);
        await rejects(() => a.listen(), "ERR_SERVER_ALREADY_LISTEN");
      } finally {
        a.close();
        b.close();
      }
    },
    async closeLifecycle({ createServer }) {
      const server = createServer().listen();
      const order: string[] = [];
      server.on("close", () => order.push("close"));
      server.close(() => order.push("callback"));
      order.push("return");
      equal(server.listening, false);
      equal(server.address(), null);
      await Promise.resolve();
      equal(order, ["return", "close", "callback"]);
    },
    async streamResponse({ createServer, httpServerHandler }) {
      let finish!: () => void;
      const server = createServer((_req, res) => {
        res.write("first");
        finish = () => {
          res.end("last");
        };
      });
      try {
        const response = await httpServerHandler(server).fetch(
          new Request("https://example.test/"),
        );
        const reader = response.body!.getReader();
        equal(new TextDecoder().decode((await reader.read()).value), "first");
        finish();
        equal(new TextDecoder().decode((await reader.read()).value), "last");
        equal((await reader.read()).done, true);
      } finally {
        server.close();
      }
    },
    async streamRequest({ createServer, httpServerHandler }) {
      const server = createServer((req, res) => req.pipe(res));
      try {
        const response = await httpServerHandler(server).fetch(
          new Request("https://example.test/", {
            method: "POST",
            body: "upload",
          }),
        );
        equal(await response.text(), "upload");
      } finally {
        server.close();
      }
    },
    async asyncFailure({ createServer, httpServerHandler }) {
      const server = createServer(async () => {
        await Promise.resolve();
        throw new Error("async handler");
      });
      try {
        await rejects(
          () =>
            httpServerHandler(server).fetch(
              new Request("https://example.test/"),
            ),
          undefined,
          "async handler",
        );
      } finally {
        server.close();
      }
    },
    async dispatchContext({ createServer, httpServerHandler }) {
      const env = { key: 1 },
        ctx = {};
      const server = createServer((req, res) => {
        const cloudflare = (
          req as unknown as { cloudflare: { env: unknown; ctx: unknown } }
        ).cloudflare;
        equal(cloudflare.env === env, true);
        equal(cloudflare.ctx === ctx, true);
        res.end("ok");
      });
      try {
        equal(
          await (
            await httpServerHandler(server).fetch(
              new Request("https://example.test/"),
              env,
              ctx,
            )
          ).text(),
          "ok",
        );
      } finally {
        server.close();
      }
    },
    moduleSurface({
      module,
      bridge,
      Agent,
      ClientRequest,
      IncomingMessage,
      OutgoingMessage,
      Server,
      ServerResponse,
      get,
      globalAgent,
      maxHeaderSize,
      request,
      setMaxIdleHTTPParsers,
    }) {
      equal(Object.keys(module).sort(), expectedSurface.http);
      equal(Object.keys(bridge).sort(), expectedSurface.bridge);
      for (const name of Object.keys(
        expectedSurface.prototypes,
      ) as (keyof typeof expectedSurface.prototypes)[]) {
        equal(
          Object.getOwnPropertyNames(module[name].prototype).sort(),
          expectedSurface.prototypes[name],
        );
      }
      equal(maxHeaderSize, 16384);
      equal(
        (new Server({}) as Server & { requireHostHeader: boolean })
          .requireHostHeader,
        true,
      );
      for (const timeout of [0, 1000, 120000]) {
        const server = new Server({ requestTimeout: timeout });
        equal(
          [server.requestTimeout, server.headersTimeout],
          [timeout, Math.min(60000, timeout)],
        );
      }
      for (const key of [
        "maxHeaderSize",
        "keepAliveTimeout",
        "keepAliveTimeoutBuffer",
        "connectionsCheckingInterval",
      ])
        expectCode(
          () => new Server({ [key]: 1 }),
          "ERR_OPTION_NOT_IMPLEMENTED",
        );
      for (const key of [
        "insecureHTTPParser",
        "requireHostHeader",
        "joinDuplicateHeaders",
        "rejectNonStandardBodyWrites",
      ])
        expectCode(() => new Server({ [key]: "yes" }), "ERR_INVALID_ARG_TYPE");
      expectCode(() => new Server({ requestTimeout: -1 }), "ERR_OUT_OF_RANGE");
      expectCode(
        () => new Server({ requestTimeout: "1" } as never),
        "ERR_INVALID_ARG_TYPE",
      );
      equal(globalAgent instanceof Agent, true);
      equal(
        new ClientRequest("http://example.test/") instanceof OutgoingMessage,
        true,
      );
      equal(
        new IncomingMessage(null as never) instanceof IncomingMessage,
        true,
      );
      equal(new Server() instanceof Server, true);
      equal(
        new ServerResponse(new IncomingMessage(null as never)) instanceof
          OutgoingMessage,
        true,
      );
      equal(typeof request, "function");
      equal(typeof get, "function");
      try {
        setMaxIdleHTTPParsers(1);
      } catch (error) {
        equal((error as { code?: string }).code, "ERR_METHOD_NOT_IMPLEMENTED");
        return;
      }
      throw new Error("Expected setMaxIdleHTTPParsers to throw");
    },
    outgoingHeaders({ IncomingMessage, ServerResponse }) {
      const response = new ServerResponse(
        new IncomingMessage(null as never),
      ) as ServerResponse & { getRawHeaderNames(): string[] };
      response.setHeader("X-Test", "one");
      response.appendHeader("X-Test", "two");
      equal(response.getHeader("x-test"), ["one", "two"]);
      equal(response.getRawHeaderNames(), ["X-Test"]);
      response.removeHeader("x-test");
      equal(response.hasHeader("x-test"), false);
      const values = ["one"];
      response.setHeader("x-shared", values);
      values.push("two");
      equal(response.getHeader("x-shared"), ["one", "two"]);
      expectCode(
        () => response.setHeaders([] as never),
        "ERR_INVALID_ARG_TYPE",
      );
      const cookies = new Headers([
        ["set-cookie", "a=1"],
        ["set-cookie", "b=2"],
      ]);
      response.setHeaders(cookies);
      equal(
        response.getHeader("set-cookie"),
        [...cookies]
          .filter(([key]) => key === "set-cookie")
          .map(([, value]) => value),
      );
      response.writeHead(200);
      expectCode(() => response.setHeaders(new Map()), "ERR_HTTP_HEADERS_SENT");
      response.destroy();
      const incoming = new IncomingMessage(null as never) as IncomingMessage & {
        _addHeaderLines(values: string[], length: number): void;
      };
      incoming._addHeaderLines(
        [
          "User-Agent",
          "first",
          "User-Agent",
          "second",
          "Referer",
          "first",
          "Referer",
          "second",
        ],
        8,
      );
      equal(
        [incoming.headers["user-agent"], incoming.headers.referer],
        ["first", "first"],
      );
      for (const chunks of [["ab"], ["a", "b"], []]) {
        const request = new IncomingMessage(null as never);
        request.method = "GET";
        const strict = new ServerResponse(request);
        strict.on("error", () => {});
        strict.strictContentLength = true;
        strict.setHeader("content-length", "1");
        strict.writeHead(200);
        expectCode(() => {
          for (const chunk of chunks.slice(0, -1)) strict.write(chunk);
          strict.end(chunks.at(-1));
        }, "ERR_HTTP_CONTENT_LENGTH_MISMATCH");
        strict.destroy();
      }
      for (const status of [204, 304]) {
        const noBody = new ServerResponse(new IncomingMessage(null as never));
        noBody.statusCode = status;
        noBody.strictContentLength = true;
        noBody.setHeader("content-length", "1");
        noBody.end("ab");
        noBody.destroy();
      }
    },
    async agentStubs({ Agent, createServer }) {
      for (const maximum of [0, -1, NaN, "2", null]) {
        await rejects(
          () => new Agent({ maxTotalSockets: maximum as number }),
          typeof maximum === "number"
            ? "ERR_OUT_OF_RANGE"
            : "ERR_INVALID_ARG_TYPE",
        );
      }
      for (const maximum of [1, 1.5, Infinity])
        equal(new Agent({ maxTotalSockets: maximum }).maxTotalSockets, maximum);
      equal(new Agent(null as never).maxTotalSockets, Infinity);
      equal(new Agent().getName({ port: 0 }), "localhost::");
      const server = createServer();
      await rejects(
        () => server.getConnections("bad" as never),
        "ERR_INVALID_ARG_TYPE",
      );
      let synchronous = true;
      await new Promise<void>((resolve) => {
        equal(
          server.getConnections((error, count) => {
            equal(synchronous, false);
            equal(error, null);
            equal(count, 0);
            resolve();
          }),
          server,
        );
        synchronous = false;
      });
      const agent = new Agent();
      equal(
        agent.getName({ host: "example.test", port: 80 }),
        "example.test:80:",
      );
      equal(agent.keepSocketAlive(null!), false);
      equal(
        (
          agent as Agent & { addRequest(req: unknown, options: unknown): void }
        ).addRequest(null, {}),
        undefined,
      );
      try {
        agent.createConnection({} as never);
      } catch (error) {
        equal((error as { code?: string }).code, "ERR_METHOD_NOT_IMPLEMENTED");
        return;
      }
      throw new Error("Expected Agent.createConnection to throw");
    },
    async clientRequestResponse({ request }) {
      const originalFetch = globalThis.fetch;
      let observed!: { url: string; method?: string; body: string };
      globalThis.fetch = (async (
        input: URL | RequestInfo,
        init?: RequestInit,
      ) => {
        observed = {
          url: String(input),
          method: init?.method,
          body: init?.body ? await new Response(init.body).text() : "",
        };
        return new Response("reply", {
          status: 201,
          statusText: "Created",
          headers: { "x-result": "yes" },
        });
      }) as typeof fetch;
      try {
        const response = await new Promise<IncomingMessage>(
          (resolve, reject) => {
            const outgoing = request(
              "http://example.test:8080/path?q=1",
              { method: "POST", headers: { "x-request": "yes" } },
              resolve,
            );
            outgoing.once("error", reject);
            outgoing.end("payload");
          },
        );
        let body = "";
        for await (const chunk of response) body += chunk;
        equal(observed, {
          url: "http://example.test:8080/path?q=1",
          method: "POST",
          body: "payload",
        });
        equal(
          {
            statusCode: response.statusCode,
            statusMessage: response.statusMessage,
            result: response.headers["x-result"],
            body,
          },
          {
            statusCode: 201,
            statusMessage: "Created",
            result: "yes",
            body: "reply",
          },
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
    async clientGet({ get }) {
      const originalFetch = globalThis.fetch;
      let observed!: { method?: string; body: BodyInit | null | undefined };
      globalThis.fetch = (async (
        _input: URL | RequestInfo,
        init?: RequestInit,
      ) => {
        observed = { method: init?.method, body: init?.body };
        return new Response("get-response");
      }) as typeof fetch;
      try {
        const response = await new Promise<IncomingMessage>(
          (resolve, reject) => {
            const outgoing = get("http://example.test/", resolve);
            outgoing.once("error", reject);
          },
        );
        let body = "";
        for await (const chunk of response) body += chunk;
        equal(
          { method: observed.method, body: observed.body, response: body },
          {
            method: "GET",
            body: null,
            response: "get-response",
          },
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
    clientValidation({ ClientRequest }) {
      for (const key of [
        "joinDuplicateHeaders",
        "insecureHTTPParser",
        "lookup",
        "createConnection",
        "socketPath",
      ])
        expectCode(
          () => new ClientRequest("http://example.test", { [key]: 1 } as never),
          "ERR_INVALID_ARG_TYPE",
        );
      for (const key of ["host", "hostname"])
        expectCode(
          () => new ClientRequest({ [key]: 1 } as never),
          "ERR_INVALID_ARG_TYPE",
        );
      for (const options of [
        { lookup() {} },
        { createConnection() {} },
        { socketPath: "/tmp/socket" },
        { maxHeaderSize: 1 },
      ])
        expectCode(
          () => new ClientRequest("http://example.test", options as never),
          "ERR_OPTION_NOT_IMPLEMENTED",
        );
      const NewClientRequest = ClientRequest as unknown as new (
        url: string,
        options?: { path?: string; method?: string },
      ) => InstanceType<typeof ClientRequest>;
      for (const [operation, expectedCode] of [
        [
          () =>
            new NewClientRequest("http://example.test/", {
              path: "//evil.test",
            }),
          "ERR_INVALID_ARG_VALUE",
        ],
        [
          () =>
            new NewClientRequest("http://example.test/", {
              method: "bad method",
            }),
          "ERR_INVALID_HTTP_TOKEN",
        ],
      ] as const) {
        try {
          operation();
        } catch (error) {
          equal((error as { code?: string }).code, expectedCode);
          continue;
        }
        throw new Error("Expected invalid client request option");
      }
      const strict = new ClientRequest("http://example.test", {
        method: "POST",
      } as never) as ClientRequest & { strictContentLength: boolean };
      strict.on("error", () => {});
      strict.strictContentLength = true;
      strict.setHeader("content-length", "1");
      strict.flushHeaders();
      expectCode(() => strict.write("ab"), "ERR_HTTP_CONTENT_LENGTH_MISMATCH");
      strict.destroy();
      const implicit = new ClientRequest("http://example.test", {
        method: "POST",
      } as never) as ClientRequest & { strictContentLength: boolean };
      implicit.on("error", () => {});
      implicit.strictContentLength = true;
      implicit.setHeader("content-length", "1");
      implicit.write("a");
      equal(implicit.headersSent, true);
      expectCode(
        () => implicit.setHeader("late", "value"),
        "ERR_HTTP_HEADERS_SENT",
      );
      expectCode(() => implicit.write("b"), "ERR_HTTP_CONTENT_LENGTH_MISMATCH");
      implicit.destroy();
      const outgoing = new ClientRequest("http://example.test/");
      outgoing.on("error", () => {});
      for (const operation of [
        () => outgoing.setNoDelay(),
        () => outgoing.setSocketKeepAlive(),
      ]) {
        try {
          operation();
        } catch (error) {
          equal((error as { code?: string }).code, "ERR_INVALID_ARG_TYPE");
          continue;
        }
        throw new Error("Expected socket stub argument validation");
      }
      outgoing.setNoDelay(true);
      outgoing.setSocketKeepAlive(true, 1);
      outgoing.abort();
    },
    async clientDestroy({ ClientRequest }) {
      const outgoing = new ClientRequest("http://example.test/");
      const error = new Promise<Error>((resolve) =>
        outgoing.once("error", resolve),
      );
      const close = new Promise<void>((resolve) =>
        outgoing.once("close", resolve),
      );
      outgoing.destroy();
      const failure = await error;
      equal((failure as Error & { code?: string }).code, "ECONNRESET");
      equal(failure.message, "socket hang up");
      await close;
      const invalid = new ClientRequest({ host: "invalid host" });
      const invalidError = new Promise<Error>((resolve) =>
        invalid.once("error", resolve),
      );
      const invalidClose = new Promise<void>((resolve) =>
        invalid.once("close", resolve),
      );
      invalid.end();
      equal((await invalidError).name, "TypeError");
      await invalidClose;
      const mutated = new ClientRequest("http://example.test/");
      mutated.path = "//other.test/a";
      const pathError = new Promise<Error>((resolve) =>
        mutated.once("error", resolve),
      );
      const pathClose = new Promise<void>((resolve) =>
        mutated.once("close", resolve),
      );
      mutated.end();
      equal(
        ((await pathError) as Error & { code?: string }).code,
        "ERR_INVALID_ARG_VALUE",
      );
      await pathClose;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (() => {
        throw Error("Missing Host must not reach network");
      }) as typeof fetch;
      try {
        const missingHost = await new Promise<IncomingMessage>(
          (resolve, reject) => {
            const outgoing = new ClientRequest(
              { host: "example.test", setHost: false },
              resolve,
            );
            outgoing.once("error", reject);
            outgoing.end();
          },
        );
        equal(missingHost.statusCode, 400);
        for await (const _chunk of missingHost) {
          /* Drain. */
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
    async clientResponseTimeout({ get }) {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response(new ReadableStream<Uint8Array>())) as typeof fetch;
      try {
        const response = await new Promise<IncomingMessage>(
          (resolve, reject) => {
            const outgoing = get("http://example.test/", resolve);
            outgoing.once("error", () => {});
            outgoing.setTimeout(1_000);
            queueMicrotask(() => outgoing.once("error", reject));
          },
        );
        await new Promise<void>((resolve) => {
          response.setTimeout(5, resolve);
          response.resume();
        });
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
    async tcpBridgeMissingListener({ connectHandler, handleAsNodeConnection }) {
      const socket = {
        opened: Promise.resolve({ localAddress: "127.0.0.1:80" }),
      };
      await rejects(
        () => handleAsNodeConnection(socket as never),
        "ERR_INVALID_ARG_VALUE",
      );
      await rejects(
        () => connectHandler().connect(socket as never),
        "ERR_INVALID_ARG_VALUE",
      );
    },
  },
};
const supported = { status: "supported" } as const;
export class NodeHttp extends FeatureImplementation<typeof nodeHttpFeature> {
  constructor() {
    super(nodeHttpFeature, {
      serverDescriptor: supported,
      portDescriptors: supported,
      invalidDescriptor: supported,
      ephemeralPorts: supported,
      closeLifecycle: supported,
      streamResponse: supported,
      streamRequest: supported,
      asyncFailure: supported,
      dispatchContext: supported,
      moduleSurface: supported,
      outgoingHeaders: supported,
      agentStubs: supported,
      clientRequestResponse: supported,
      clientGet: supported,
      clientValidation: supported,
      clientDestroy: supported,
      clientResponseTimeout: supported,
      tcpBridgeMissingListener: supported,
    });
  }
  create() {
    return api;
  }
}

// Public surface captured from fixed workerd v1.20261012.1. Both implementations
// execute this same check; a matching surface alone does not certify behavior.
const expectedSurface = {
  http: [
    "Agent",
    "ClientRequest",
    "CloseEvent",
    "IncomingMessage",
    "METHODS",
    "MessageEvent",
    "OutgoingMessage",
    "STATUS_CODES",
    "Server",
    "ServerResponse",
    "WebSocket",
    "_connectionListener",
    "createServer",
    "get",
    "globalAgent",
    "maxHeaderSize",
    "request",
    "setMaxIdleHTTPParsers",
    "validateHeaderName",
    "validateHeaderValue",
  ],
  bridge: [
    "connectHandler",
    "handleAsNodeConnection",
    "handleAsNodeRequest",
    "httpServerHandler",
  ],
  prototypes: {
    Agent: [
      "addRequest",
      "constructor",
      "createConnection",
      "createSocket",
      "destroy",
      "getName",
      "keepSocketAlive",
      "removeSocket",
      "reuseSocket",
    ],
    IncomingMessage: [
      "_addHeaderLine",
      "_addHeaderLineDistinct",
      "_addHeaderLines",
      "_destroy",
      "_dump",
      "_read",
      "connection",
      "constructor",
      "headers",
      "headersDistinct",
      "setTimeout",
      "socket",
      "trailers",
      "trailersDistinct",
    ],
    OutgoingMessage: [
      "_finish",
      "_flush",
      "_flushOutput",
      "_implicitHeader",
      "_renderHeaders",
      "_send",
      "_storeHeader",
      "_writeRaw",
      "appendHeader",
      "closed",
      "constructor",
      "cork",
      "destroy",
      "end",
      "errored",
      "flushHeaders",
      "getHeader",
      "getHeaderNames",
      "getHeaders",
      "getRawHeaderNames",
      "hasHeader",
      "headersSent",
      "pipe",
      "removeHeader",
      "setHeader",
      "setHeaders",
      "uncork",
      "writableCorked",
      "writableEnded",
      "writableHighWaterMark",
      "writableLength",
      "writableNeedDrain",
      "writableObjectMode",
      "write",
    ],
    ClientRequest: [
      "_implicitHeader",
      "_write",
      "abort",
      "addTrailers",
      "clearTimeout",
      "constructor",
      "destroy",
      "end",
      "onSocket",
      "setNoDelay",
      "setSocketKeepAlive",
      "setTimeout",
      "write",
    ],
    Server: [
      "address",
      "close",
      "closeAllConnections",
      "closeIdleConnections",
      "connections",
      "constructor",
      "getConnections",
      "listen",
      "listening",
      "maxConnections",
      "ref",
      "setTimeout",
      "unref",
    ],
    ServerResponse: [
      "_implicitHeader",
      "assignSocket",
      "constructor",
      "destroy",
      "detachSocket",
      "writeContinue",
      "writeEarlyHints",
      "writeHead",
      "writeProcessing",
    ],
  },
};

export const nodeHttpNetworkFeature = defineFeature<
  Pick<typeof api, "request" | "get"> & { baseURL: string }
>()("node.http.network", [
  "get",
  "post",
  "redirect",
  "cookies",
  "compression",
  "abort",
]);
export const nodeHttpNetworkContract: ContractSuite<
  typeof nodeHttpNetworkFeature
> = {
  feature: nodeHttpNetworkFeature,
  cases: {
    async get({ get, baseURL }) {
      const response = await new Promise<IncomingMessage>((resolve, reject) => {
        get(`${baseURL}/get`, resolve).once("error", reject);
      });
      let body = "";
      for await (const chunk of response) body += chunk;
      equal(
        [response.statusCode, body, response.complete],
        [200, "hello", true],
      );
    },
    async post({ request, baseURL }) {
      const response = await new Promise<IncomingMessage>((resolve, reject) => {
        const outgoing = request(
          `${baseURL}/echo`,
          { method: "POST" },
          resolve,
        );
        outgoing.once("error", reject);
        outgoing.write("one");
        outgoing.end("two");
      });
      let body = "";
      for await (const chunk of response) body += chunk;
      equal(body, "onetwo");
    },
    async redirect({ get, baseURL }) {
      const response = await new Promise<IncomingMessage>((resolve, reject) => {
        get(`${baseURL}/redirect`, resolve).once("error", reject);
      });
      for await (const _chunk of response) {
        /* Drain before checking completion. */
      }
      equal(response.statusCode, 302);
      equal(response.headers.location, "/get");
    },
    async cookies({ get, baseURL }) {
      const response = await new Promise<IncomingMessage>((resolve, reject) => {
        get(`${baseURL}/cookies`, resolve).once("error", reject);
      });
      for await (const _chunk of response) {
        /* Drain. */
      }
      equal(
        response.headers["set-cookie"],
        "a=1; Path=/, b=2; Expires=Wed, 21 Oct 2030 07:28:00 GMT",
      );
      equal(response.headersDistinct["set-cookie"], [
        response.headers["set-cookie"],
      ]);
      equal(response.rawHeaders, []);
    },
    async compression({ get, baseURL }) {
      const response = await new Promise<IncomingMessage>((resolve, reject) => {
        get(`${baseURL}/gzip`, resolve).once("error", reject);
      });
      const bytes: number[] = [];
      for await (const chunk of response) bytes.push(...chunk);
      equal(bytes.slice(0, 2), [31, 139]);
    },
    async abort({ get, baseURL }) {
      await new Promise<void>((resolve, reject) => {
        const outgoing = get(`${baseURL}/never`, () =>
          reject(Error("Unexpected response")),
        );
        outgoing.once("error", (error) => {
          try {
            equal(error.message, "cancelled request");
            resolve();
          } catch (failure) {
            reject(failure);
          }
        });
        queueMicrotask(() => outgoing.destroy(new Error("cancelled request")));
      });
    },
  },
};

function expectCode(operation: () => unknown, code: string) {
  try {
    operation();
  } catch (error) {
    equal((error as { code?: string }).code, code);
    return;
  }
  throw Error(`Expected ${code}`);
}
