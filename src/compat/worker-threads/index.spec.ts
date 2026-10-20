import * as actual from "node:worker_threads";
import { EventEmitter } from "node:events";
import {
  defineFeature,
  FeatureImplementation,
} from "cf-workers-mobile/shared/contracts";
import type { ContractSuite } from "cf-workers-mobile/shared/contracts/testing";
const api = actual as unknown as typeof import("./index.js");
function same(a: unknown, b: unknown) {
  if (a !== b) throw Error(`${String(a)} != ${String(b)}`);
}
function equal(a: unknown, b: unknown) {
  same(JSON.stringify(a), JSON.stringify(b));
}
function unsupported(fn: () => unknown, method: string) {
  try {
    fn();
  } catch (e) {
    same((e as any).code, "ERR_METHOD_NOT_IMPLEMENTED");
    same((e as Error).message, `The ${method} method is not implemented`);
    return;
  }
  throw Error("Expected rejection");
}
export const workerThreadsFeature = defineFeature<typeof api>()(
  "node.worker_threads",
  [
    "surface",
    "platform",
    "environment",
    "constructors",
    "workerPrototype",
    "workerRejections",
    "markers",
    "portUtilities",
    "channel",
    "transfer",
    "cloneError",
    "close",
  ] as const,
);
export const workerThreadsContract: ContractSuite<typeof workerThreadsFeature> =
  {
    feature: workerThreadsFeature,
    cases: {
      surface(api) {
        const names = [
          "BroadcastChannel",
          "MessageChannel",
          "MessagePort",
          "Worker",
          "SHARE_ENV",
          "getEnvironmentData",
          "isMainThread",
          "isMarkedAsUntransferable",
          "markAsUntransferable",
          "markAsUncloneable",
          "moveMessagePortToContext",
          "parentPort",
          "receiveMessageOnPort",
          "resourceLimits",
          "setEnvironmentData",
          "postMessageToThread",
          "threadId",
          "workerData",
          "isInternalThread",
        ];
        equal(Object.keys(api).sort(), [...names, "default"].sort());
        equal(Object.keys(api.default).sort(), names.sort());
        for (const name of names)
          same((api.default as any)[name], (api as any)[name]);
        same(
          Object.getPrototypeOf(api.Worker.prototype),
          EventEmitter.prototype,
        );
      },
      platform(api) {
        same(api.isMainThread, true);
        same(api.isInternalThread, false);
        same(api.threadId, 0);
        same(api.workerData, null);
        same(api.parentPort, null);
        equal(api.resourceLimits, {});
        same(api.SHARE_ENV, Symbol.for("nodejs.worker_threads.SHARE_ENV"));
      },
      environment(api) {
        const key = "compat-worker-threads-test";
        const value = { a: 1 };
        same(api.setEnvironmentData(key, value), undefined);
        same(api.getEnvironmentData(key), value);
        value.a = 2;
        same((api.getEnvironmentData(key) as any).a, 2);
        api.setEnvironmentData(key, undefined as never);
        same(api.getEnvironmentData(key), undefined);
      },
      constructors(api) {
        unsupported(() => new api.Worker(), "Worker");
        unsupported(() => new api.BroadcastChannel(), "BroadcastChannel");
        let error;
        try {
          new api.MessagePort();
        } catch (e) {
          error = e;
        }
        same(error instanceof TypeError, true);
      },
      async workerPrototype(api) {
        const p = api.Worker.prototype;
        equal(
          Object.getOwnPropertyNames(p).sort(),
          [
            "constructor",
            "cpuUsage",
            "postMessage",
            "postMessageToThread",
            "ref",
            "unref",
            "terminate",
            "getHeapSnapshot",
            "getHeapStatistics",
            "startCpuProfile",
            "startHeapProfile",
          ].sort(),
        );
        for (const name of ["postMessage", "ref", "unref"] as const)
          same(Reflect.apply(p[name], {}, []), undefined);
        same(await Reflect.apply(p.postMessageToThread, {}, []), undefined);
        same(
          await Reflect.apply(
            p[
              Symbol.asyncDispose ??
                (Symbol.for(
                  "Symbol.asyncDispose",
                ) as typeof Symbol.asyncDispose)
            ],
            {},
            [],
          ),
          undefined,
        );
      },
      async workerRejections(api) {
        for (const name of [
          "cpuUsage",
          "terminate",
          "getHeapSnapshot",
          "getHeapStatistics",
          "startCpuProfile",
          "startHeapProfile",
        ] as const) {
          const promise = Reflect.apply(api.Worker.prototype[name], {}, []);
          same(promise instanceof Promise, true);
          await promise.then(
            () => {
              throw Error("Expected rejection");
            },
            (e: Error & { code: string }) => {
              same(e.code, "ERR_METHOD_NOT_IMPLEMENTED");
              same(e.message, `The Worker.${name} method is not implemented`);
            },
          );
        }
        unsupported(
          () => api.postMessageToThread(1, {}),
          "postMessageToThread",
        );
      },
      markers(api) {
        for (const value of [undefined, null, {}, new ArrayBuffer(1), 1]) {
          same(api.isMarkedAsUntransferable(value), false);
          same(api.markAsUntransferable(value), undefined);
          same(api.markAsUncloneable(value), undefined);
          same(api.isMarkedAsUntransferable(value), false);
        }
      },
      portUtilities(api) {
        same(api.receiveMessageOnPort(undefined as never), undefined);
        let error;
        try {
          api.moveMessagePortToContext(undefined as never, {});
        } catch (e) {
          error = e;
        }
        same(error instanceof TypeError, true);
      },
      async channel(api) {
        const { port1, port2 } = new api.MessageChannel();
        try {
          same(port1 instanceof api.MessagePort, true);
          same(port2 instanceof api.MessagePort, true);
          same(port1 instanceof EventTarget, true);
          const payload = {
            list: [1, "two"],
            map: new Map([["a", 1]]),
            set: new Set([2]),
            date: new Date(5),
            bytes: new Uint8Array([1, 2]),
          };
          const result = new Promise<any>((resolve) => {
            port2.onmessage = (event) => resolve(event.data);
          });
          port1.postMessage(payload);
          const copy = await result;
          same(copy === payload, false);
          equal(copy.list, payload.list);
          same(copy.map.get("a"), 1);
          same(copy.set.has(2), true);
          same(copy.date.getTime(), 5);
          equal([...copy.bytes], [1, 2]);
          const order: string[] = [];
          port2.onmessage = () => order.push("message");
          port1.postMessage(1);
          queueMicrotask(() => order.push("microtask"));
          await Promise.resolve();
          await Promise.resolve();
          equal(order, ["message", "microtask"]);
          port2.onmessage = null;
          port1.postMessage("buffered");
          let buffered;
          port2.addEventListener(
            "message",
            (e) => {
              buffered = (e as MessageEvent).data;
            },
            { once: true },
          );
          await Promise.resolve();
          same(buffered, "buffered");
        } finally {
          port1.close();
          port2.close();
        }
      },
      transfer(api) {
        const { port1, port2 } = new api.MessageChannel();
        try {
          for (const options of [
            [new ArrayBuffer(1)],
            { transfer: [new ArrayBuffer(1)] },
          ]) {
            let error;
            try {
              port1.postMessage("x", options as never);
            } catch (e) {
              error = e;
            }
            same((error as Error)?.message, "Transfer list is not supported");
          }
          for (const options of [undefined, null, [], {}, { transfer: [] }])
            same(port1.postMessage("x", options as never), undefined);
        } finally {
          port1.close();
          port2.close();
        }
      },
      cloneError(api) {
        const { port1, port2 } = new api.MessageChannel();
        try {
          let error;
          try {
            port1.postMessage(() => {});
          } catch (e) {
            error = e;
          }
          same((error as Error)?.name, "DataCloneError");
        } finally {
          port1.close();
          port2.close();
        }
      },
      async close(api) {
        const { port1, port2 } = new api.MessageChannel();
        same(port1.start(), undefined);
        same(port1.close(), undefined);
        same(port1.close(), undefined);
        same(port1.postMessage("closed"), undefined);
        port2.close();
        const channel = new api.MessageChannel();
        const events: string[] = [];
        channel.port1.addEventListener("close", () => events.push("one"));
        channel.port2.addEventListener("close", () => events.push("two"));
        channel.port1.close();
        equal(events, ["two", "one"]);
        channel.port2.close();
        equal(events, ["two", "one"]);
        let error;
        try {
          channel.port1.postMessage(() => {});
        } catch (e) {
          error = e;
        }
        same((error as Error)?.name, "DataCloneError");
      },
    },
  };
export class WorkerThreadsImplementation extends FeatureImplementation<
  typeof workerThreadsFeature
> {
  constructor() {
    super(workerThreadsFeature, {
      surface: { status: "supported" },
      platform: { status: "supported" },
      environment: { status: "supported" },
      constructors: { status: "supported" },
      workerPrototype: { status: "supported" },
      workerRejections: { status: "supported" },
      markers: { status: "supported" },
      portUtilities: { status: "supported" },
      channel: { status: "supported" },
      transfer: { status: "supported" },
      cloneError: { status: "supported" },
      close: { status: "supported" },
    });
  }
  create() {
    return api;
  }
}
