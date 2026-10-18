import net, * as netNamespace from "node:net";
import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";
import type localNet from "./index.js";

export type NetApi = typeof localNet;
const api = net as unknown as NetApi;
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
function failure(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    equal((error as { code: string }).code, code);
    return;
  }
  throw new Error(`Expected ${code}`);
}
export const netFeature = defineFeature<NetApi>()("node.net", [
  "exports",
  "ip",
  "normalize",
  "socketAddress",
  "blockList",
  "autoFamily",
  "boundSocket",
  "server",
  "socket",
]);
export const netContract: ContractSuite<typeof netFeature> = {
  feature: netFeature,
  cases: {
    exports(api) {
      if (api === (net as unknown as NetApi)) {
        equal(
          Object.keys(netNamespace).sort(),
          [...Object.keys(api), "default"].sort(),
        );
        for (const key of Object.keys(api) as (keyof NetApi)[])
          equal((netNamespace as unknown as NetApi)[key] === api[key], true);
      }
      equal(
        Object.keys(api).sort(),
        [
          "BlockList",
          "BoundSocket",
          "SocketAddress",
          "Stream",
          "Server",
          "Socket",
          "connect",
          "createConnection",
          "createServer",
          "getDefaultAutoSelectFamily",
          "setDefaultAutoSelectFamily",
          "getDefaultAutoSelectFamilyAttemptTimeout",
          "setDefaultAutoSelectFamilyAttemptTimeout",
          "isIP",
          "isIPv4",
          "isIPv6",
          "_normalizeArgs",
        ].sort(),
      );
      equal(api.Stream === api.Socket, true);
      equal(api.connect === api.createConnection, true);
      for (const [constructor, methods] of [
        [api.BoundSocket, ["address", "fd", "close"]],
        [api.SocketAddress, ["toJSON"]],
        [
          api.BlockList,
          [
            "addAddress",
            "addRange",
            "addSubnet",
            "check",
            "toJSON",
            "fromJSON",
          ],
        ],
        [
          api.Server,
          ["listen", "close", "address", "getConnections", "ref", "unref"],
        ],
        [
          api.Socket,
          [
            "connect",
            "write",
            "end",
            "destroy",
            "setTimeout",
            "setNoDelay",
            "setKeepAlive",
            "resetAndDestroy",
            "address",
            "ref",
            "unref",
          ],
        ],
      ] as const)
        for (const method of methods)
          equal(
            typeof (
              constructor.prototype as unknown as Record<string, unknown>
            )[method],
            "function",
          );
      equal(
        typeof api.BoundSocket.prototype[
          Symbol.dispose ??
            (Symbol.for("Symbol.dispose") as typeof Symbol.dispose)
        ],
        "function",
      );
      equal(
        typeof api.Server.prototype[
          Symbol.asyncDispose ??
            (Symbol.for("Symbol.asyncDispose") as typeof Symbol.asyncDispose)
        ],
        "function",
      );
    },
    ip(api) {
      for (const [input, version] of [
        ["127.0.0.1", 4],
        ["255.255.255.255", 4],
        ["0.0.0.0", 4],
        ["256.0.0.1", 0],
        ["01.2.3.4", 0],
        ["::1", 6],
        ["2001:db8::1", 6],
        ["::ffff:192.0.2.1", 6],
        ["[::1]", 0],
        ["1::2::3", 0],
        ["localhost", 0],
        ["", 0],
        [null, 0],
        [{}, 0],
      ] as const) {
        equal(api.isIP(input), version);
        equal(api.isIPv4(input), version === 4);
        equal(api.isIPv6(input), version === 6);
      }
    },
    normalize(api) {
      const cb = () => {};
      const normalized = api._normalizeArgs([80, "example.test", cb]);
      equal(normalized[0], { port: 80, host: "example.test" });
      equal(normalized[1] === cb, true);
      equal(api._normalizeArgs([]), [{}, null]);
      equal(api._normalizeArgs(["pipe", cb]), [{ path: "pipe" }, cb]);
      equal(api._normalizeArgs(["80"]), [{ port: "80" }, null]);
      const options = { port: 1 };
      equal(api._normalizeArgs([options])[0] === options, true);
    },
    socketAddress({ SocketAddress }) {
      const address = new SocketAddress({ address: "127.0.0.1", port: 8080 });
      equal(address.toJSON(), {
        address: "127.0.0.1",
        port: 8080,
        family: "ipv4",
        flowlabel: 0,
      });
      equal(SocketAddress.isSocketAddress(address), true);
      equal(SocketAddress.isSocketAddress(address.toJSON()), false);
      equal(SocketAddress.parse("127.0.0.1:8080")?.port, 8080);
      equal(SocketAddress.parse("not an address"), undefined);
      failure(() => new SocketAddress({ port: -1 }), "ERR_SOCKET_BAD_PORT");
      equal(new SocketAddress().toJSON(), {
        address: "127.0.0.1",
        port: 0,
        family: "ipv4",
        flowlabel: 0,
      });
      equal(new SocketAddress({ family: "ipv6", flowlabel: 15 }).toJSON(), {
        address: "::",
        port: 0,
        family: "ipv6",
        flowlabel: 15,
      });
      equal(SocketAddress.parse("[::1]:4321")?.toJSON(), {
        address: "::1",
        port: 4321,
        family: "ipv6",
        flowlabel: 0,
      });
      failure(
        () => new SocketAddress({ family: "bad" as never }),
        "ERR_INVALID_ARG_VALUE",
      );
      failure(() => SocketAddress.parse(null as never), "ERR_INVALID_ARG_TYPE");
    },
    blockList({ BlockList, SocketAddress }) {
      const list = new BlockList();
      list.addAddress("192.0.2.1");
      list.addRange("192.0.2.10", "192.0.2.20");
      list.addSubnet("2001:db8::", 32, "ipv6");
      for (const [address, type, result] of [
        ["192.0.2.1", "ipv4", true],
        ["192.0.2.9", "ipv4", false],
        ["192.0.2.20", "ipv4", true],
        ["192.0.2.21", "ipv4", false],
        ["2001:db8::1", "ipv6", true],
        ["2001:db9::1", "ipv6", false],
      ] as const)
        equal(list.check(address, type), result);
      equal(list.check(new SocketAddress({ address: "192.0.2.1" })), true);
      equal(BlockList.isBlockList(list), true);
      const restored = new BlockList();
      restored.fromJSON(list.toJSON());
      equal(restored.rules, list.rules);
    },
    autoFamily(api) {
      equal(api.getDefaultAutoSelectFamily(), false);
      api.setDefaultAutoSelectFamily(false);
      failure(
        () => api.setDefaultAutoSelectFamily(true),
        "ERR_INVALID_ARG_VALUE",
      );
      const previous = api.getDefaultAutoSelectFamilyAttemptTimeout();
      try {
        api.setDefaultAutoSelectFamilyAttemptTimeout(1);
        equal(api.getDefaultAutoSelectFamilyAttemptTimeout(), 10);
      } finally {
        api.setDefaultAutoSelectFamilyAttemptTimeout(previous);
      }
      for (const value of [0, -1, 2147483648, 1.5, NaN, Infinity])
        failure(
          () => api.setDefaultAutoSelectFamilyAttemptTimeout(value),
          "ERR_OUT_OF_RANGE",
        );
      for (const value of ["10", null, {}, undefined])
        failure(
          () => api.setDefaultAutoSelectFamilyAttemptTimeout(value),
          "ERR_INVALID_ARG_TYPE",
        );
      equal(api.getDefaultAutoSelectFamilyAttemptTimeout(), previous);
    },
    boundSocket({ BoundSocket }) {
      const bound = new BoundSocket({ port: 34101 });
      try {
        equal(BoundSocket.isBoundSocket(bound), true);
        equal(bound.address()?.port, 34101);
        equal(bound.fd(), -1);
        failure(() => new BoundSocket({ port: 34101 }), "EADDRINUSE");
      } finally {
        bound.close();
      }
      failure(() => bound.address(), "ERR_SOCKET_HANDLE_ADOPTED");
      const next = new BoundSocket({ port: 34101 });
      next.close();
      const first = new BoundSocket({ port: 34101, reusePort: true });
      const second = new BoundSocket({ port: 34101, reusePort: true });
      first.close();
      failure(() => new BoundSocket({ port: 34101 }), "EADDRINUSE");
      second.close();
      failure(() => new BoundSocket({ path: "pipe" }), "ERR_INVALID_ARG_VALUE");
      failure(
        () => new BoundSocket({ host: "localhost" }),
        "ERR_INVALID_ARG_VALUE",
      );
      const v6 = new BoundSocket({ ipv6Only: true });
      try {
        equal(v6.address().family, "IPv6");
        equal(v6.address().port >= 49152, true);
      } finally {
        v6.close();
      }
    },
    async server({ createServer, BoundSocket }) {
      const bound = new BoundSocket({ port: 34102 });
      const server = createServer();
      server.listen(bound);
      equal(server.listening, true);
      failure(() => bound.address(), "ERR_SOCKET_HANDLE_ADOPTED");
      failure(() => bound.close(), "ERR_SOCKET_HANDLE_ADOPTED");
      equal(server.address()?.port, 34102);
      failure(() => server.listen(), "ERR_SERVER_ALREADY_LISTEN");
      failure(() => new BoundSocket({ port: 34102 }), "EADDRINUSE");
      await new Promise<void>((resolve) => server.close(() => resolve()));
      equal(server.listening, false);
      equal(server.address(), null);
      const next = new BoundSocket({ port: 34102 });
      next.close();
    },
    socket({ Socket }) {
      const socket = new Socket();
      equal(socket.connecting, false);
      equal(socket.readableEnded, false);
      equal(socket.writableEnded, false);
      equal(socket.writableFinished, false);
      equal(socket.errored, null);
      equal(socket.bytesRead, 0);
      equal(socket.bytesWritten, 0);
      equal(socket.setNoDelay(), socket);
      equal(socket.setKeepAlive(), socket);
      equal(socket.ref(), undefined);
      equal(socket.unref(), undefined);
      socket.destroy();
      failure(() => new Socket({ fd: 1 }), "ERR_OPTION_NOT_IMPLEMENTED");
      failure(() => new Socket({ objectMode: true }), "ERR_INVALID_ARG_VALUE");
    },
  },
};
export class NetImplementation extends FeatureImplementation<
  typeof netFeature
> {
  constructor(private readonly implementation: NetApi = api) {
    super(
      netFeature,
      Object.fromEntries(
        netFeature.cases.map((id) => [id, { status: "supported" }]),
      ) as never,
    );
  }
  create() {
    return this.implementation;
  }
}

/** Real TCP I/O, shared by workerd and the native WebViews. */
export async function runNetNetworkContract(
  baseURL: string,
  implementation: NetApi = api,
) {
  const url = new URL(baseURL);
  const events: string[] = [];
  const socket = implementation.createConnection({
    host: url.hostname,
    port: Number(url.port),
  });
  const response = await new Promise<string>((resolve, reject) => {
    let body = "";
    const timeout = setTimeout(
      () => socket.destroy(new Error("TCP contract timed out")),
      10000,
    );
    socket.on("error", reject);
    socket.on("connect", () => {
      events.push("connect");
      socket.write(
        `GET /get HTTP/1.1\r\nHost: ${url.host}\r\nConnection: close\r\n\r\n`,
      );
    });
    socket.on("ready", () => events.push("ready"));
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      events.push("data");
      body += chunk;
    });
    socket.on("end", () => events.push("end"));
    socket.on("close", (hadError) => {
      clearTimeout(timeout);
      if (hadError) {
        setTimeout(
          () => reject(socket.errored ?? new Error("TCP closed with error")),
          0,
        );
      } else resolve(body);
    });
  });
  equal(events.slice(0, 2), ["connect", "ready"]);
  equal(events.at(-1), "end");
  equal(response.startsWith("HTTP/1.1 200"), true);
  equal(response.endsWith("hello"), true);
  equal(socket.bytesRead > 0, true);
  equal(socket.bytesWritten > 0, true);
  equal(socket.destroyed, true);
  for (const mode of ["halfClose", "onread", "writev", "lookup"] as const) {
    const payload = "x".repeat(mode === "writev" ? 131073 : 31);
    let received = "";
    let lookupCalled = false;
    const options = {
      allowHalfOpen: true,
      ...(mode === "onread"
        ? {
            onread: {
              buffer: new Uint8Array(127),
              callback(count: number, buffer: Uint8Array) {
                received += new TextDecoder().decode(buffer.subarray(0, count));
                return true;
              },
            },
          }
        : {}),
    };
    const connection = new implementation.Socket(options);
    await new Promise<void>((resolve, reject) => {
      connection.on("error", reject);
      connection.setTimeout(10000, () =>
        connection.destroy(new Error(`${mode} timed out`)),
      );
      if (mode !== "onread")
        connection.on("data", (chunk) => {
          received += chunk.toString();
        });
      connection.once("end", () => {
        if (mode !== "halfClose") {
          try {
            equal(connection.writable, true);
          } catch (error) {
            reject(error);
          }
          connection.end();
        }
      });
      connection.once("close", (hadError) =>
        hadError ? reject(new Error(`${mode} failed`)) : resolve(),
      );
      connection.connect(
        {
          host: mode === "lookup" ? "fixture.invalid" : url.hostname,
          port: Number(url.port),
          ...(mode === "lookup"
            ? {
                lookup: (
                  _host: string,
                  _options: unknown,
                  callback: (
                    error: null,
                    address: string,
                    family: number,
                  ) => void,
                ) => {
                  lookupCalled = true;
                  callback(null, url.hostname, 4);
                },
              }
            : {}),
        } as never,
        () => {
          const header = `POST /echo HTTP/1.1\r\nHost: ${url.host}\r\nContent-Length: ${payload.length}\r\nConnection: close\r\n\r\n`;
          if (mode === "writev") connection.cork();
          connection.write(header);
          connection.write(payload.slice(0, 17));
          connection.write(new TextEncoder().encode(payload.slice(17)));
          if (mode === "writev") connection.uncork();
          if (mode === "halfClose") connection.end();
        },
      );
    });
    equal(received.split("\r\n\r\n").slice(1).join("\r\n\r\n"), payload);
    equal(connection.bytesWritten > payload.length, true);
    if (mode === "lookup") equal(lookupCalled, true);
  }
  const paused = implementation.createConnection({
    host: url.hostname,
    port: Number(url.port),
  });
  const errors: unknown[] = [];
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Paused reset was not observed"));
      paused.destroy();
    }, 5000);
    paused.on("error", (error) => errors.push(error));
    paused.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
    paused.once("connect", () => {
      paused.pause();
      paused.write(`GET /tcp-reset HTTP/1.1\r\nHost: ${url.host}\r\n\r\n`);
    });
  });
  // The pinned workerd surfaces a paused reset as EOF, not an active read error.
  equal(errors.length, 0);

  for (const terminal of ["fin", "reset", "reset-flowing"]) {
    const connection = implementation.createConnection({
      host: url.hostname,
      port: Number(url.port),
    });
    let received = "";
    const errors: unknown[] = [];
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Paused after data: ${terminal} was not observed`));
        connection.destroy();
      }, 5000);
      connection.on("error", (error) => errors.push(error));
      connection.on("data", (chunk) => {
        received += chunk.toString();
        if (terminal !== "reset-flowing") connection.pause();
      });
      connection.once("close", () => {
        clearTimeout(timeout);
        resolve();
      });
      connection.once("connect", () =>
        connection.write(
          `GET /tcp-data-${terminal.replace("-flowing", "")} HTTP/1.1\r\nHost: ${url.host}\r\n\r\n`,
        ),
      );
    });
    equal(received, "received");
    if (errors.length)
      throw new Error(
        `Paused after data ${terminal}: ${errors.map(String).join("; ")}`,
      );
  }

  for (const path of ["/get", "/large"]) {
    const held = implementation.createConnection({
      host: url.hostname,
      port: Number(url.port),
    });
    let received = "";
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Paused payload did not drain"));
        held.destroy();
      }, 10000);
      held.on("error", reject);
      held.on("data", (chunk) => {
        received += chunk.toString();
      });
      held.once("close", () => {
        clearTimeout(timeout);
        resolve();
      });
      held.once("connect", () => {
        held.pause();
        held.write(
          `GET ${path} HTTP/1.1\r\nHost: ${url.host}\r\nConnection: close\r\n\r\n`,
        );
        setTimeout(() => {
          try {
            equal(held.destroyed, false);
            held.resume();
          } catch (error) {
            reject(error);
            held.destroy();
          }
        }, 50);
      });
    });
    equal(
      received.split("\r\n\r\n").slice(1).join("\r\n\r\n"),
      path === "/get" ? "hello" : "a".repeat(512 * 1024),
    );
  }

  for (const mode of ["abort", "timeout", "reset"] as const) {
    const controller = new AbortController();
    const connection = new implementation.Socket({ signal: controller.signal });
    const events: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const limit = setTimeout(() => {
        reject(new Error(`${mode} did not close`));
        connection.destroy();
      }, 10000);
      connection.on("error", (error) => {
        events.push("error");
        if (
          mode !== "abort" ||
          (error as { code?: string }).code !== "ABORT_ERR"
        )
          reject(error);
      });
      connection.once("close", () => {
        events.push("close");
        clearTimeout(limit);
        resolve();
      });
      connection.connect({ host: url.hostname, port: Number(url.port) }, () => {
        if (mode === "reset") connection.resetAndDestroy();
        if (mode === "timeout")
          connection.setTimeout(30, () => {
            events.push("timeout");
            connection.destroy();
          });
      });
      if (mode === "abort") controller.abort();
    });
    equal(
      events,
      mode === "abort"
        ? ["error", "close"]
        : mode === "timeout"
          ? ["timeout", "close"]
          : ["close"],
    );
    equal(connection.destroyed, true);
  }
}

/** Accept through the public bridge and Server, without registering internals. */
export async function runNetIncomingContract(
  implementation: NetApi,
  accept: (socket: unknown) => Promise<void>,
) {
  let finish!: () => void;
  const closed = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let output = "";
  const server = implementation.createServer((socket) => {
    socket.on("data", (chunk) => socket.write(chunk));
  });
  server.listen(34103);
  let readable: ReadableStream<Uint8Array>;
  const start = (
    controller:
      | ReadableStreamDefaultController<Uint8Array>
      | ReadableByteStreamController,
  ) => {
    controller.enqueue(new TextEncoder().encode("hello TCP"));
    controller.close();
  };
  try {
    readable = new ReadableStream<Uint8Array>({ type: "bytes", start });
  } catch {
    readable = new ReadableStream<Uint8Array>({ start });
  }
  const socket = {
    opened: Promise.resolve({
      localAddress: "127.0.0.1:34103",
      remoteAddress: "127.0.0.1:54321",
    }),
    closed,
    readable,
    writable: new WritableStream<Uint8Array>({
      write(chunk) {
        output += new TextDecoder().decode(chunk);
      },
      close() {
        finish();
      },
    }),
    async close() {
      finish();
    },
  };
  try {
    await accept(socket);
    equal(output, "hello TCP");
    equal(
      await new Promise<number>((resolve, reject) =>
        server.getConnections((error, count) =>
          error ? reject(error) : resolve(count),
        ),
      ),
      0,
    );
  } finally {
    finish();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  const dropping = implementation.createServer();
  dropping.maxConnections = 0;
  dropping.listen(34103);
  let dropped = false;
  dropping.on("drop", (detail) => {
    dropped = detail.remotePort === 54321;
  });
  try {
    await accept(socket);
    equal(dropped, true);
  } finally {
    await new Promise<void>((resolve) => dropping.close(() => resolve()));
  }

  let accepted!: InstanceType<NetApi["Socket"]>;
  let acceptReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    acceptReady = resolve;
  });
  let finishPending!: () => void;
  const pendingClosed = new Promise<void>((resolve) => {
    finishPending = resolve;
  });
  let pendingController!:
    | ReadableStreamDefaultController<Uint8Array>
    | ReadableByteStreamController;
  let pendingReadable: ReadableStream<Uint8Array>;
  const pendingStart = (controller: typeof pendingController) => {
    pendingController = controller;
  };
  try {
    pendingReadable = new ReadableStream<Uint8Array>({
      type: "bytes",
      start: pendingStart,
    });
  } catch {
    pendingReadable = new ReadableStream<Uint8Array>({ start: pendingStart });
  }
  const paused = implementation
    .createServer({ pauseOnConnect: true }, (incoming) => {
      accepted = incoming;
      acceptReady();
    })
    .listen(34103);
  const accepting = accept({
    ...socket,
    closed: pendingClosed,
    readable: pendingReadable,
    writable: new WritableStream<Uint8Array>(),
    async close() {
      pendingController.error(new Error("closed"));
      finishPending();
    },
  });
  try {
    await ready;
    equal(accepted.isPaused(), true);
    equal(
      await new Promise<number>((resolve, reject) =>
        paused.getConnections((error, count) =>
          error ? reject(error) : resolve(count),
        ),
      ),
      1,
    );
    let serverClosed = false;
    const closing = new Promise<void>((resolve) =>
      paused.close(() => {
        serverClosed = true;
        resolve();
      }),
    );
    await Promise.resolve();
    equal(serverClosed, false);
    accepted.destroy();
    await Promise.all([accepting, closing]);
    equal(serverClosed, true);
  } finally {
    accepted?.destroy();
    finishPending();
  }
}
