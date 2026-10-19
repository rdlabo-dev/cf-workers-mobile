import os, * as namespace from "node:os";
import {
  defineFeature,
  FeatureImplementation,
} from "workers-capacitor/shared/contracts";
import type { ContractSuite } from "workers-capacitor/shared/contracts/testing";
import { expectedConstants } from "./constants.spec";
const groups = [
  "exports",
  "virtualPlatform",
  "freshResults",
  "priority",
  "userInfo",
  "constants",
] as const;
export const osFeature = defineFeature<typeof os>()("node.os", groups);
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
function failure(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    equal((e as { code: string }).code, code);
    equal(e instanceof TypeError, true);
    return;
  }
  throw new Error(`Expected ${code}`);
}
export const osContract: ContractSuite<typeof osFeature> = {
  feature: osFeature,
  cases: {
    exports(api) {
      const names = [
        "EOL",
        "devNull",
        "constants",
        "availableParallelism",
        "arch",
        "cpus",
        "endianness",
        "freemem",
        "getPriority",
        "homedir",
        "hostname",
        "loadavg",
        "machine",
        "networkInterfaces",
        "platform",
        "release",
        "setPriority",
        "tmpdir",
        "totalmem",
        "type",
        "uptime",
        "userInfo",
        "version",
      ];
      equal(Object.keys(api).sort(), names.sort());
      equal(Object.keys(namespace).sort(), [...names, "default"].sort());
      for (const name of names) {
        const key = name as keyof typeof os;
        equal(api[key] === namespace[key], true);
      }
    },
    virtualPlatform(api) {
      equal(api.EOL, "\n");
      equal(api.devNull, "/dev/null");
      for (const [name, value] of Object.entries({
        availableParallelism: 1,
        arch: "x64",
        endianness: "LE",
        freemem: 0,
        homedir: "/tmp/",
        hostname: "localhost",
        machine: "x86_64",
        platform: "linux",
        release: "",
        tmpdir: "/tmp/",
        totalmem: 0,
        type: "Linux",
        uptime: 0,
        version: "",
      })) {
        equal((api[name as keyof typeof os] as () => unknown)(), value);
      }
    },
    freshResults(api) {
      equal(api.cpus(), []);
      equal(api.loadavg(), [0, 0, 0]);
      equal(api.networkInterfaces(), {});
      equal(api.userInfo(), {});
      const cpus = api.cpus();
      cpus.push({} as never);
      equal(api.cpus(), []);
      const load = api.loadavg();
      load[0] = 999;
      equal(api.loadavg(), [0, 0, 0]);
      equal(api.networkInterfaces() === api.networkInterfaces(), false);
      equal(api.userInfo() === api.userInfo(), false);
    },
    priority(api) {
      equal(api.getPriority(), 0);
      for (const value of [NaN, Infinity, -Infinity, 1.5, -1, 0, 2 ** 40]) {
        equal(api.getPriority(value), 0);
        equal(api.setPriority(value, value), undefined);
      }
      for (const value of [null, "1", {}, [], true, 1n, Symbol("pid")]) {
        failure(() => api.getPriority(value as number), "ERR_INVALID_ARG_TYPE");
        failure(
          () => api.setPriority(value as number, 1),
          "ERR_INVALID_ARG_TYPE",
        );
        failure(
          () => api.setPriority(1, value as number),
          "ERR_INVALID_ARG_TYPE",
        );
      }
      failure(() => api.setPriority(1), "ERR_INVALID_ARG_TYPE");
    },
    userInfo(api) {
      for (const encoding of [
        undefined,
        null,
        "buffer",
        "utf8",
        "UTF8",
        "hex",
        "base64",
        "base64url",
        "ascii",
        "binary",
        "ucs2",
        "utf16le",
        "latin1",
      ])
        equal(api.userInfo({ encoding } as never), {});
      for (const encoding of ["", "utf9", 1, false, {}, Symbol("encoding")])
        failure(
          () => api.userInfo({ encoding } as never),
          "ERR_INVALID_ARG_VALUE",
        );
      for (const options of [null, false, "utf8", [], () => {}])
        failure(() => api.userInfo(options as never), "ERR_INVALID_ARG_TYPE");
      let count = 0;
      equal(
        api.userInfo({
          get encoding() {
            count++;
            return "utf8" as const;
          },
        }),
        {},
      );
      equal(count, 1);
      const sentinel = {};
      try {
        api.userInfo({
          get encoding(): never {
            throw sentinel;
          },
        });
      } catch (error) {
        if (error !== sentinel) throw error;
        return;
      }
      throw new Error("Getter did not throw");
    },
    constants(api) {
      equal(api.constants, expectedConstants);
      for (const value of [
        api.constants,
        ...Object.values(api.constants).filter((v) => typeof v === "object"),
      ]) {
        equal(Object.getPrototypeOf(value), null);
        equal(Object.isFrozen(value), true);
      }
    },
  },
};
export class OsImplementation extends FeatureImplementation<typeof osFeature> {
  constructor() {
    super(osFeature, {
      exports: { status: "supported" },
      virtualPlatform: { status: "supported" },
      freshResults: { status: "supported" },
      priority: { status: "supported" },
      userInfo: { status: "supported" },
      constants: { status: "supported" },
    });
  }
  create() {
    return os;
  }
}
