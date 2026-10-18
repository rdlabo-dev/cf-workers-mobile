import api, * as namespace from "node:dgram";
import { EventEmitter } from "node:events";
import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/workers-capacitor/features";
import type { ContractSuite } from "@rdlabo/workers-capacitor/testing";
import type local from "./index.js";
type Api = typeof local;
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
function same(a: unknown, b: unknown) {
  if (a !== b) throw Error("Identity mismatch");
}
function failure(fn: () => unknown, code: string, method?: string) {
  try {
    fn();
  } catch (e) {
    const error = e as Error & { code: string };
    equal(error.code, code);
    if (method) equal(error.message, `The ${method} method is not implemented`);
    return;
  }
  throw Error(`Expected ${code}`);
}
const unsupported = (fn: () => unknown, method: string) =>
  failure(fn, "ERR_METHOD_NOT_IMPLEMENTED", method);
export const dgramFeature = defineFeature<Api>()("node.dgram", [
  "exports",
  "construction",
  "noops",
  "addresses",
  "events",
  "prototype",
] as const);
export const dgramContract: ContractSuite<typeof dgramFeature> = {
  feature: dgramFeature,
  cases: {
    exports(api) {
      equal(Object.keys(api).sort(), ["Socket", "createSocket"]);
      equal(Object.keys(namespace).sort(), [
        "Socket",
        "createSocket",
        "default",
      ]);
      same(api.Socket, namespace.Socket);
      same(api.createSocket, namespace.createSocket);
      same(Object.getPrototypeOf(api.Socket), EventEmitter);
      same(Object.getPrototypeOf(api.Socket.prototype), EventEmitter.prototype);
    },
    construction(api) {
      for (const type of ["udp4", "udp6", "anything", {}]) {
        const socket = api.createSocket(type as never);
        same(socket instanceof api.Socket, true);
      }
      for (const type of [undefined, null, 1, [], () => {}])
        failure(() => api.createSocket(type as never), "ERR_INVALID_ARG_TYPE");
      failure(
        () => api.createSocket("udp4", null as never),
        "ERR_INVALID_ARG_TYPE",
      );
      let called = 0;
      const socket = api.createSocket("udp4", () => called++);
      (socket as any).emit("message", new Uint8Array());
      equal(called, 0);
    },
    noops(api) {
      const socket = api.createSocket("udp4") as any;
      let calls = 0;
      for (const name of [
        "connect",
        "disconnect",
        "sendto",
        "send",
        "setBroadcast",
        "setTTL",
        "setMulticastTTL",
        "setMulticastLoopback",
        "setMulticastInterface",
        "addMembership",
        "dropMembership",
        "addSourceSpecificMembership",
        "dropSourceSpecificMembership",
        "setRecvBufferSize",
        "setSendBufferSize",
      ])
        same(
          socket[name](-1, null, () => calls++),
          undefined,
        );
      equal(calls, 0);
      for (const name of ["bind", "close", "ref", "unref"])
        same(
          socket[name](() => calls++),
          socket,
        );
      equal(calls, 0);
    },
    addresses(api) {
      const socket = api.createSocket("udp4") as any;
      for (const name of ["address", "remoteAddress"]) {
        equal(socket[name](), {});
        same(socket[name]() === socket[name](), false);
      }
      for (const name of [
        "getRecvBufferSize",
        "getSendBufferSize",
        "getSendQueueSize",
        "getSendQueueCount",
      ])
        equal(socket[name](), 0);
    },
    events(api) {
      const socket = api.createSocket("udp4") as any;
      let calls = 0;
      socket.once("example", () => calls++);
      socket.emit("example");
      socket.emit("example");
      equal(calls, 1);
    },
    prototype(api) {
      equal(
        Object.getOwnPropertyNames(api.Socket.prototype).sort(),
        [
          "constructor",
          "bind",
          "connect",
          "disconnect",
          "sendto",
          "send",
          "close",
          "address",
          "remoteAddress",
          "setBroadcast",
          "setTTL",
          "setMulticastTTL",
          "setMulticastLoopback",
          "setMulticastInterface",
          "addMembership",
          "dropMembership",
          "addSourceSpecificMembership",
          "dropSourceSpecificMembership",
          "ref",
          "unref",
          "setRecvBufferSize",
          "setSendBufferSize",
          "getRecvBufferSize",
          "getSendBufferSize",
          "getSendQueueSize",
          "getSendQueueCount",
        ].sort(),
      );
      const symbol = Symbol.asyncDispose ?? Symbol.for("Symbol.asyncDispose");
      const result = Reflect.apply(
        (api.Socket.prototype as any)[symbol],
        {},
        [],
      );
      return Promise.resolve(result).then((value) => same(value, undefined));
    },
  },
};
export class DgramImplementation extends FeatureImplementation<
  typeof dgramFeature
> {
  constructor() {
    super(dgramFeature, {
      exports: { status: "supported" },
      construction: { status: "supported" },
      noops: { status: "supported" },
      addresses: { status: "supported" },
      events: { status: "supported" },
      prototype: { status: "supported" },
    });
  }
  create() {
    return api as unknown as Api;
  }
}
