import v8, * as namespace from "node:v8";
import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";
import type local from "./index.js";
type Api = typeof local;
const groups = [
  "exports",
  "statistics",
  "snapshot",
  "validation",
  "serialization",
  "serializerPrototype",
  "deserializerPrototype",
  "profiler",
  "promiseHooks",
  "startupSnapshot",
  "queryObjects",
] as const;
export const v8Feature = defineFeature<Api>()("node.v8", groups);
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
function failure(fn: () => unknown, code: string, method?: string) {
  try {
    fn();
  } catch (e) {
    const error = e as Error & { code: string };
    equal(error.code, code);
    if (method) {
      equal(error.name, "Error");
      equal(error.message, `The ${method} method is not implemented`);
    }
    return;
  }
  throw new Error(`Expected ${code}`);
}
const unsupported = (fn: () => unknown, method: string) =>
  failure(fn, "ERR_METHOD_NOT_IMPLEMENTED", method);
export const v8Contract: ContractSuite<typeof v8Feature> = {
  feature: v8Feature,
  cases: {
    exports(api) {
      const names = [
        "cachedDataVersionTag",
        "getHeapSnapshot",
        "getHeapStatistics",
        "getHeapSpaceStatistics",
        "getHeapCodeStatistics",
        "getCppHeapStatistics",
        "setFlagsFromString",
        "Serializer",
        "Deserializer",
        "DefaultSerializer",
        "DefaultDeserializer",
        "deserialize",
        "takeCoverage",
        "stopCoverage",
        "serialize",
        "writeHeapSnapshot",
        "promiseHooks",
        "startupSnapshot",
        "setHeapSnapshotNearHeapLimit",
        "GCProfiler",
        "queryObjects",
        "isStringOneByteRepresentation",
      ].sort();
      equal(Object.keys(api).sort(), names);
      equal(Object.keys(namespace).sort(), [...names, "default"].sort());
      for (const name of names)
        equal(
          api[name as keyof Api] ===
            (namespace as unknown as Api)[name as keyof Api],
          true,
        );
    },
    statistics(api) {
      equal(api.cachedDataVersionTag(), 0);
      equal(api.getHeapSpaceStatistics(), []);
      equal(
        api.getHeapSpaceStatistics() === api.getHeapSpaceStatistics(),
        false,
      );
      equal(api.getHeapStatistics(), {
        total_heap_size: 0,
        total_heap_size_executable: 0,
        total_physical_size: 0,
        total_available_size: 0,
        used_heap_size: 0,
        heap_size_limit: 0,
        malloced_memory: 0,
        peak_malloced_memory: 0,
        does_zap_garbage: 0,
        number_of_native_contexts: 0,
        number_of_detached_contexts: 0,
        total_global_handles_size: 0,
        used_global_handles_size: 0,
        external_memory: 0,
        total_allocated_bytes: 0,
      });
      equal(api.getHeapCodeStatistics(), {
        code_and_metadata_size: 0,
        bytecode_and_metadata_size: 0,
        external_script_source_size: 0,
        cpu_profiler_metadata_size: 0,
      });
      for (const detail_level of ["brief", "detailed"])
        equal(api.getCppHeapStatistics(detail_level), {
          committed_size_bytes: 0,
          resident_size_bytes: 0,
          used_size_bytes: 0,
          space_statistics: [],
          type_names: [],
          detail_level,
        });
      equal(api.getCppHeapStatistics(), api.getCppHeapStatistics("detailed"));
    },
    snapshot(api) {
      unsupported(() => api.getHeapSnapshot(), "getHeapSnapshot");
      unsupported(() => api.writeHeapSnapshot(), "writeHeapSnapshot");
      unsupported(
        () =>
          api.writeHeapSnapshot("file", {
            exposeInternals: true,
            exposeNumericValues: false,
          }),
        "writeHeapSnapshot",
      );
      unsupported(() => api.setFlagsFromString("--x"), "setFlagsFromString");
      unsupported(
        () => api.isStringOneByteRepresentation("abc"),
        "isStringOneByteRepresentation",
      );
      unsupported(
        () => api.setHeapSnapshotNearHeapLimit(1),
        "setHeapSnapshotNearHeapLimit",
      );
      unsupported(() => api.takeCoverage(), "takeCoverage");
      unsupported(() => api.stopCoverage(), "stopCoverage");
    },
    validation(api) {
      for (const value of [null, [], 1, false, ""]) {
        failure(
          () => api.getHeapSnapshot(value as never),
          "ERR_INVALID_ARG_TYPE",
        );
        if (typeof value === "string")
          unsupported(() => api.writeHeapSnapshot(value), "writeHeapSnapshot");
        else
          failure(
            () => api.writeHeapSnapshot(value as never),
            "ERR_INVALID_ARG_TYPE",
          );
      }
      for (const key of ["exposeInternals", "exposeNumericValues"])
        failure(
          () => api.getHeapSnapshot({ [key]: 1 }),
          "ERR_INVALID_ARG_TYPE",
        );
      for (const value of [null, 1, {}, Symbol("x")]) {
        failure(
          () => api.setFlagsFromString(value as string),
          "ERR_INVALID_ARG_TYPE",
        );
        failure(
          () => api.isStringOneByteRepresentation(value as string),
          "ERR_INVALID_ARG_TYPE",
        );
      }
      for (const value of [0, -1, 1.5, NaN, Infinity, 2 ** 32])
        failure(
          () => api.setHeapSnapshotNearHeapLimit(value),
          "ERR_OUT_OF_RANGE",
        );
      failure(
        () => api.setHeapSnapshotNearHeapLimit("1" as never),
        "ERR_INVALID_ARG_TYPE",
      );
      for (const value of [null, "", 1, "summary"])
        failure(
          () => api.getCppHeapStatistics(value as string),
          "ERR_INVALID_ARG_VALUE",
        );
    },
    serialization(api) {
      unsupported(() => new api.Serializer(), "Serializer");
      unsupported(() => new api.DefaultSerializer(), "Serializer");
      unsupported(() => new api.Deserializer(new Uint8Array()), "Deserializer");
      unsupported(
        () => new api.DefaultDeserializer(new Uint8Array()),
        "Deserializer",
      );
      for (const value of [undefined, null, {}, 1, "x"]) {
        unsupported(() => api.serialize(value), "serialize");
        unsupported(() => api.deserialize(value as never), "deserialize");
      }
    },
    serializerPrototype(api) {
      const names = [
        "writeHeader",
        "writeValue",
        "releaseBuffer",
        "transferArrayBuffer",
        "writeUint32",
        "writeUint64",
        "writeDouble",
        "writeRawBytes",
        "_getDataCloneError",
        "_getSharedArrayBufferId",
        "_setTreatArrayBufferViewsAsHostObjects",
        "_writeHostObject",
      ];
      equal(
        Object.getOwnPropertyNames(api.Serializer.prototype).sort(),
        [...names, "constructor"].sort(),
      );
      equal(
        Object.getPrototypeOf(api.DefaultSerializer.prototype) ===
          api.Serializer.prototype,
        true,
      );
      for (const name of names)
        unsupported(
          () =>
            Reflect.apply(
              (api.Serializer.prototype as unknown as Record<string, Function>)[
                name
              ]!,
              {},
              [],
            ),
          name,
        );
    },
    deserializerPrototype(api) {
      const names = [
        "readHeader",
        "readValue",
        "transferArrayBuffer",
        "getWireFormatVersion",
        "readUint32",
        "readUint64",
        "readDouble",
        "readRawBytes",
        "_readHostObject",
      ];
      equal(
        Object.getOwnPropertyNames(api.Deserializer.prototype).sort(),
        [...names, "constructor"].sort(),
      );
      equal(
        Object.getPrototypeOf(api.DefaultDeserializer.prototype) ===
          api.Deserializer.prototype,
        true,
      );
      for (const name of names)
        unsupported(
          () =>
            Reflect.apply(
              (
                api.Deserializer.prototype as unknown as Record<
                  string,
                  Function
                >
              )[name]!,
              {},
              [],
            ),
          name,
        );
    },
    profiler(api) {
      const p = new api.GCProfiler();
      equal(Object.getOwnPropertyNames(api.GCProfiler.prototype).sort(), [
        "constructor",
        "start",
        "stop",
      ]);
      unsupported(() => p.start(), "GCProfiler.start");
      unsupported(() => p.stop(), "GCProfiler.stop");
    },
    promiseHooks(api) {
      const names = [
        "createHook",
        "onInit",
        "onBefore",
        "onAfter",
        "onSettled",
      ];
      equal(Object.keys(api.promiseHooks).sort(), names.sort());
      for (const name of names)
        for (const value of [undefined, {}, () => {}])
          unsupported(
            () =>
              Reflect.apply(
                (api.promiseHooks as Record<string, Function>)[name]!,
                null,
                [value],
              ),
            `promiseHooks.${name}`,
          );
    },
    startupSnapshot(api) {
      const names = [
        "addSerializeCallback",
        "addDeserializeCallback",
        "setDeserializeMainFunction",
      ];
      equal(
        Object.keys(api.startupSnapshot).sort(),
        [...names, "isBuildingSnapshot"].sort(),
      );
      equal(api.startupSnapshot.isBuildingSnapshot(), false);
      for (const name of names)
        unsupported(
          () =>
            Reflect.apply(
              (api.startupSnapshot as Record<string, Function>)[name]!,
              null,
              [],
            ),
          `startupSnapshot.${name}`,
        );
    },
    queryObjects(api) {
      for (const ctor of [undefined, null, {}, 1])
        failure(() => api.queryObjects(ctor as never), "ERR_INVALID_ARG_TYPE");
      for (const options of [null, [], 1])
        failure(
          () => api.queryObjects(Object, options as never),
          "ERR_INVALID_ARG_TYPE",
        );
      failure(
        () => api.queryObjects(Object, { format: "x" } as never),
        "ERR_INVALID_ARG_VALUE",
      );
      for (const format of [undefined, null, "", "count", "summary"])
        unsupported(
          () => api.queryObjects(Object, { format } as never),
          "queryObjects",
        );
    },
  },
};
export class V8Implementation extends FeatureImplementation<typeof v8Feature> {
  constructor() {
    super(v8Feature, {
      exports: { status: "supported" },
      statistics: { status: "supported" },
      snapshot: { status: "supported" },
      validation: { status: "supported" },
      serialization: { status: "supported" },
      serializerPrototype: { status: "supported" },
      deserializerPrototype: { status: "supported" },
      profiler: { status: "supported" },
      promiseHooks: { status: "supported" },
      startupSnapshot: { status: "supported" },
      queryObjects: { status: "supported" },
    });
  }
  create() {
    return v8 as unknown as Api;
  }
}
