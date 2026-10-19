import api, * as actualNamespace from "node:domain";
const namespace = actualNamespace as unknown as typeof import("./index.js");
import { EventEmitter } from "node:events";
import {
  defineFeature,
  FeatureImplementation,
} from "workers-capacitor/shared/contracts";
import type { ContractSuite } from "workers-capacitor/shared/contracts/testing";
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
export const domainFeature = defineFeature<Api>()("node.domain", [
  "exports",
  "creation",
  "noops",
  "run",
  "callbacks",
  "events",
] as const);
export const domainContract: ContractSuite<typeof domainFeature> = {
  feature: domainFeature,
  cases: {
    exports(api) {
      equal(Object.keys(api).sort(), [
        "Domain",
        "active",
        "create",
        "createDomain",
      ]);
      equal(Object.keys(namespace).sort(), [
        "Domain",
        "active",
        "create",
        "createDomain",
        "default",
      ]);
      same(api.Domain, namespace.Domain);
      same(api.active, null);
      same(api.create, namespace.create);
      same(api.createDomain, namespace.createDomain);
      same(Object.getPrototypeOf(api.Domain.prototype), EventEmitter.prototype);
    },
    creation(api) {
      same(api.create instanceof api.Domain, true);
      const first = api.createDomain();
      const second = api.createDomain();
      same(first === second, false);
      same(first.members, undefined);
      same((EventEmitter as any).usingDomains, false);
    },
    noops(api) {
      const value = api.createDomain();
      for (const name of ["enter", "exit", "add", "remove"] as const)
        same(Reflect.apply(value[name], value, [{}]), undefined);
      same(value.members, undefined);
      same(api.active, null);
    },
    run(api) {
      const value = api.createDomain();
      const sequence: string[] = [];
      value.enter = () => {
        sequence.push("enter");
      };
      value.exit = () => {
        sequence.push("exit");
      };
      const result = value.run(
        function (this: unknown, a: number, b: number) {
          same(this, value);
          sequence.push("run");
          return a + b;
        },
        2,
        3,
      );
      equal(result, 5);
      equal(sequence, ["enter", "run", "exit"]);
      const marker = {};
      sequence.length = 0;
      try {
        value.run(() => {
          throw marker;
        });
        throw Error("did not throw");
      } catch (e) {
        same(e, marker);
      }
      equal(sequence, ["enter"]);
    },
    callbacks(api) {
      const value = api.createDomain();
      const callback = () => 1;
      same(value.bind(callback), callback);
      same(value.intercept(callback), callback);
      same(value.bind(null as never), null);
      same(value.intercept(undefined as never), undefined);
      const marker = {};
      try {
        value._errorHandler(marker);
        throw Error("did not throw");
      } catch (e) {
        same(e, marker);
      }
    },
    events(api) {
      const value = api.createDomain();
      let calls = 0;
      value.once("example", () => calls++);
      value.emit("example");
      value.emit("example");
      equal(calls, 1);
      equal(
        Object.getOwnPropertyNames(api.Domain.prototype).sort(),
        [
          "constructor",
          "_errorHandler",
          "enter",
          "exit",
          "add",
          "remove",
          "run",
          "intercept",
          "bind",
        ].sort(),
      );
    },
  },
};
export class DomainImplementation extends FeatureImplementation<
  typeof domainFeature
> {
  constructor() {
    super(domainFeature, {
      exports: { status: "supported" },
      creation: { status: "supported" },
      noops: { status: "supported" },
      run: { status: "supported" },
      callbacks: { status: "supported" },
      events: { status: "supported" },
    });
  }
  create() {
    return api as unknown as Api;
  }
}
