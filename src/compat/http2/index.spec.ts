import http2, * as namespace from "node:http2";
import { Buffer } from "node:buffer";
import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/workers-capacitor/features";
import type { ContractSuite } from "@rdlabo/workers-capacitor/testing";
import { expectedValues } from "./values.spec";
export const http2Feature = defineFeature<typeof http2>()("node.http2", [
  "exports",
  "constants",
  "settings",
  "packing",
  "unsupported",
]);
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
function unsupported(fn: () => unknown, method: string) {
  try {
    fn();
  } catch (e) {
    const error = e as Error & { code: string };
    equal(error.code, "ERR_METHOD_NOT_IMPLEMENTED");
    equal(error.message, `The http2.${method} method is not implemented`);
    return;
  }
  throw new Error(`Expected ${method} to throw`);
}
export const http2Contract: ContractSuite<typeof http2Feature> = {
  feature: http2Feature,
  cases: {
    exports(api) {
      const names = [
        "constants",
        "createSecureServer",
        "createServer",
        "Http2ServerRequest",
        "Http2ServerResponse",
        "connect",
        "getDefaultSettings",
        "getPackedSettings",
        "getUnpackedSettings",
        "performServerHandshake",
        "sensitiveHeaders",
      ].sort();
      equal(Object.keys(api).sort(), names);
      equal(Object.keys(namespace).sort(), [...names, "default"].sort());
      for (const name of names)
        equal(
          api[name as keyof typeof api] === namespace[name as keyof typeof api],
          true,
        );
      equal(typeof api.sensitiveHeaders, "symbol");
      equal(api.sensitiveHeaders.description, "nodejs.http2.sensitiveHeaders");
    },
    constants(api) {
      equal(
        Object.keys(api.constants).sort(),
        Object.keys(expectedValues).sort(),
      );
      for (const [key, value] of Object.entries(expectedValues)) {
        equal(api.constants[key as keyof typeof api.constants], value);
        const d = Object.getOwnPropertyDescriptor(api.constants, key)!;
        equal(d.writable, false);
        equal(d.enumerable, true);
        equal(d.configurable, true);
      }
    },
    settings(api) {
      const first = api.getDefaultSettings();
      const second = api.getDefaultSettings();
      equal(first === second, false);
      equal(Object.keys(first), []);
      const values = {
        headerTableSize: 4096,
        enablePush: true,
        initialWindowSize: 65535,
        maxFrameSize: 16384,
        maxConcurrentStreams: 4294967295,
        maxHeaderSize: 65535,
        maxHeaderListSize: 65535,
        enableConnectProtocol: false,
      };
      equal(Object.getPrototypeOf(first), values);
      for (const [key, value] of Object.entries(values))
        equal(first[key as keyof typeof first], value);
      first.maxConcurrentStreams = 1;
      equal(second.maxConcurrentStreams, 4294967295);
    },
    packing(api) {
      for (const input of [undefined, null, 1, {}, new Uint8Array([1, 2])]) {
        const packed = api.getPackedSettings(input as never);
        equal(Buffer.isBuffer(packed), true);
        equal(packed.length, 0);
        equal(api.getUnpackedSettings(input as never), {});
      }
      equal(api.getPackedSettings({}) === api.getPackedSettings({}), false);
      equal(
        api.getUnpackedSettings(Buffer.alloc(0)) ===
          api.getUnpackedSettings(Buffer.alloc(0)),
        false,
      );
    },
    unsupported(api) {
      for (const name of [
        "createSecureServer",
        "createServer",
        "connect",
        "performServerHandshake",
      ] as const) {
        unsupported(() => Reflect.apply(api[name], null, []), name);
        unsupported(() => Reflect.apply(api[name], null, [null, {}]), name);
      }
      for (const name of ["Http2ServerRequest", "Http2ServerResponse"] as const)
        unsupported(
          () => Reflect.construct(api[name] as unknown as Function, []),
          name,
        );
    },
  },
};
export class Http2Implementation extends FeatureImplementation<
  typeof http2Feature
> {
  constructor() {
    super(http2Feature, {
      exports: { status: "supported" },
      constants: { status: "supported" },
      settings: { status: "supported" },
      packing: { status: "supported" },
      unsupported: { status: "supported" },
    });
  }
  create() {
    return http2;
  }
}
