import api, * as actualNamespace from "node:cluster";
const namespace = actualNamespace as unknown as typeof import("./index.js");
import { EventEmitter } from "node:events";
import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/workers-capacitor/shared/contracts";
import type { ContractSuite } from "@rdlabo/workers-capacitor/shared/contracts/testing";
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
export const clusterFeature = defineFeature<Api>()("node.cluster", [
  "exports",
  "platform",
  "unsupported",
  "worker",
  "events",
] as const);
export const clusterContract: ContractSuite<typeof clusterFeature> = {
  feature: clusterFeature,
  cases: {
    exports(api) {
      equal(
        Object.keys(namespace).sort(),
        [
          "Cluster",
          "SCHED_NONE",
          "SCHED_RR",
          "Worker",
          "_events",
          "_eventsCount",
          "_maxListeners",
          "default",
          "disconnect",
          "fork",
          "isMaster",
          "isPrimary",
          "isWorker",
          "schedulingPolicy",
          "settings",
          "setupMaster",
          "setupPrimary",
          "workers",
        ].sort(),
      );
      same(Object.getPrototypeOf(api), namespace.Cluster.prototype);
      same(
        Object.getPrototypeOf(namespace.Cluster.prototype),
        EventEmitter.prototype,
      );
      same(
        Object.getPrototypeOf(namespace.Worker.prototype),
        EventEmitter.prototype,
      );
      same(api.Worker, namespace.Worker);
    },
    platform(api) {
      equal(
        [
          api.SCHED_NONE,
          api.SCHED_RR,
          api.schedulingPolicy,
          api.isMaster,
          api.isPrimary,
          api.isWorker,
        ],
        [1, 2, 2, true, true, false],
      );
      same(api.settings, namespace.settings);
      same(api.workers, namespace.workers);
      equal(api.settings, {});
      equal(api.workers, {});
      equal(namespace._events, []);
      equal(namespace._eventsCount, 0);
      equal(namespace._maxListeners, 0);
    },
    unsupported(api) {
      for (const target of [api, namespace]) {
        unsupported(() => target.fork(), "cluster.fork");
        unsupported(() => target.disconnect(), "cluster.disconnect");
        unsupported(() => target.setupPrimary(), "cluster.setupPrimary");
        unsupported(() => target.setupMaster(), "cluster.setupWorker");
      }
    },
    worker(api) {
      const worker = new api.Worker();
      equal(
        [
          worker.id,
          worker.isConnected(),
          worker.isDead(),
          worker.exitedAfterDisconnect,
        ],
        [0, false, true, false],
      );
      same(worker.process, globalThis.process);
      let calls = 0;
      equal(
        worker.send("x", null, null, () => calls++),
        false,
      );
      equal(calls, 0);
      same(worker.disconnect(), worker);
      for (const name of ["kill", "destroy"] as const) {
        worker._connected = true;
        same(worker[name](), undefined);
        same(worker.isConnected(), false);
      }
      worker._connected = true;
      same(worker.exitedAfterDisconnect, true);
      same(worker.disconnect(), worker);
      same(worker.exitedAfterDisconnect, false);
    },
    events(api) {
      const worker = new api.Worker();
      let calls = 0;
      worker.once("example", () => calls++);
      worker.emit("example");
      worker.emit("example");
      equal(calls, 1);
      const first = new namespace.Cluster();
      const second = new namespace.Cluster();
      same(first.settings, second.settings);
      same(first.workers, second.workers);
      same(first === second, false);
    },
  },
};
export class ClusterImplementation extends FeatureImplementation<
  typeof clusterFeature
> {
  constructor() {
    super(clusterFeature, {
      exports: { status: "supported" },
      platform: { status: "supported" },
      unsupported: { status: "supported" },
      worker: { status: "supported" },
      events: { status: "supported" },
    });
  }
  create() {
    return api as unknown as Api;
  }
}
