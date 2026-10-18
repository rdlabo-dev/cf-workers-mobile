import inspector, * as namespace from "node:inspector";
import promises, * as promisesNamespace from "node:inspector/promises";
import { EventEmitter } from "node:events";
import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";
const groups = [
  "exports",
  "lifecycle",
  "console",
  "session",
  "network",
  "promisesLifecycle",
  "promisesIdentity",
  "prototypes",
] as const;
export const inspectorFeature = defineFeature<typeof inspector>()(
  "node.inspector",
  groups,
);
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
function same(a: unknown, b: unknown) {
  if (a !== b) throw Error("Identity mismatch");
}
function unsupported(fn: () => unknown, method: string) {
  try {
    fn();
  } catch (e) {
    const error = e as Error & { code: string };
    equal(error.name, "Error");
    equal(error.code, "ERR_METHOD_NOT_IMPLEMENTED");
    equal(error.message, `The ${method} method is not implemented`);
    return;
  }
  throw Error(`Expected ${method} to throw synchronously`);
}
const names = [
  "Network",
  "Session",
  "close",
  "console",
  "open",
  "url",
  "waitForDebugger",
].sort();
const consoleNames = [
  "debug",
  "error",
  "info",
  "log",
  "warn",
  "dir",
  "dirxml",
  "table",
  "trace",
  "group",
  "groupCollapsed",
  "groupEnd",
  "clear",
  "count",
  "countReset",
  "assert",
  "profile",
  "profileEnd",
  "time",
  "timeLog",
  "timeStamp",
].sort();
const networkNames = [
  "requestWillBeSent",
  "dataReceived",
  "dataSent",
  "responseReceived",
  "loadingFinished",
  "loadingFailed",
  "webSocketCreated",
  "webSocketHandshakeResponseReceived",
  "webSocketClosed",
].sort();
export const inspectorContract: ContractSuite<typeof inspectorFeature> = {
  feature: inspectorFeature,
  cases: {
    exports(api) {
      for (const [value, ns] of [
        [api, namespace],
        [promises, promisesNamespace],
      ] as const) {
        equal(Object.keys(value).sort(), names);
        equal(Object.keys(ns).sort(), [...names, "default"].sort());
        for (const key of names) same((value as any)[key], (ns as any)[key]);
      }
    },
    async lifecycle(api) {
      same(api.close(), undefined);
      same(api.url(), undefined);
      same(api.waitForDebugger(), undefined);
      const first = api.open();
      const second = api.open(-1, "invalid", true);
      same(first === second, false);
      equal(Object.keys(first), []);
      const symbol = Symbol.dispose ?? Symbol.for("Symbol.dispose");
      equal(Object.getOwnPropertySymbols(first), [symbol]);
      same(await (first as any)[symbol](), undefined);
      same(await (first as any)[symbol](), undefined);
    },
    console(api) {
      for (const value of [api.console, promises.console]) {
        equal(Object.keys(value).sort(), consoleNames);
        const functions = Object.values(value);
        for (const fn of functions) {
          same(fn, functions[0]);
          same(Reflect.apply(fn, undefined, ["message", {}]), undefined);
        }
      }
    },
    session(api) {
      for (const value of [api, promises]) {
        unsupported(() => new value.Session(), "Session");
        const proto = value.Session.prototype;
        for (const name of [
          "connect",
          "connectToMainThread",
          "disconnect",
          "post",
        ])
          unsupported(
            () => Reflect.apply((proto as any)[name], {}, []),
            `Session.${name}`,
          );
      }
    },
    network(api) {
      for (const value of [api.Network, promises.Network]) {
        equal(Object.keys(value).sort(), networkNames);
        for (const name of networkNames)
          unsupported(
            () => Reflect.apply((value as any)[name], undefined, []),
            `Network.${name}`,
          );
      }
    },
    promisesLifecycle() {
      for (const name of ["close", "open", "url", "waitForDebugger"] as const)
        unsupported(() => promises[name](), `Inspector.${name}`);
    },
    promisesIdentity(api) {
      same(api === promises, false);
      for (const name of [
        "Session",
        "console",
        "Network",
        "open",
        "close",
        "url",
        "waitForDebugger",
      ] as const)
        same(api[name] === promises[name], false);
    },
    prototypes(api) {
      for (const value of [api, promises]) {
        same(
          Object.getPrototypeOf(value.Session.prototype),
          EventEmitter.prototype,
        );
        equal(
          Object.getOwnPropertyNames(value.Session.prototype).sort(),
          [
            "constructor",
            "connect",
            "connectToMainThread",
            "disconnect",
            "post",
          ].sort(),
        );
      }
    },
  },
};
export class InspectorImplementation extends FeatureImplementation<
  typeof inspectorFeature
> {
  constructor() {
    super(inspectorFeature, {
      exports: { status: "supported" },
      lifecycle: { status: "supported" },
      console: { status: "supported" },
      session: { status: "supported" },
      network: { status: "supported" },
      promisesLifecycle: { status: "supported" },
      promisesIdentity: { status: "supported" },
      prototypes: { status: "supported" },
    });
  }
  create() {
    return inspector;
  }
}
