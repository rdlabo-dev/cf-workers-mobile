import sqlite, * as namespace from "node:sqlite";
import {
  defineFeature,
  FeatureImplementation,
} from "cf-workers-mobile/shared/contracts";
import type { ContractSuite } from "cf-workers-mobile/shared/contracts/testing";
import { expectedValues } from "./values.spec";
const groups = ["exports", "constants", "constructors", "backup"] as const;
export const sqliteFeature = defineFeature<typeof sqlite>()(
  "node.sqlite",
  groups,
);
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
function same(a: unknown, b: unknown) {
  if (a !== b) throw Error("Identity mismatch");
}
function failure(fn: () => unknown, name: string, message: string) {
  try {
    fn();
  } catch (e) {
    const error = e as Error & { code: string };
    equal(error.name, name);
    equal(error.message, message);
    same(error.code, undefined);
    return;
  }
  throw Error("Expected synchronous rejection");
}
export const sqliteContract: ContractSuite<typeof sqliteFeature> = {
  feature: sqliteFeature,
  cases: {
    exports(api) {
      const names = [
        "DatabaseSync",
        "StatementSync",
        "backup",
        "constants",
      ].sort();
      equal(Object.keys(api).sort(), names);
      equal(Object.keys(namespace).sort(), [...names, "default"].sort());
      for (const name of names)
        same((api as any)[name], (namespace as any)[name]);
    },
    constants(api) {
      equal(
        Object.keys(api.constants).sort(),
        Object.keys(expectedValues).sort(),
      );
      for (const [key, value] of Object.entries(expectedValues)) {
        same((api.constants as any)[key], value);
        const d = Object.getOwnPropertyDescriptor(api.constants, key)!;
        equal([d.writable, d.enumerable, d.configurable], [true, true, true]);
      }
      const old = api.constants.SQLITE_OK;
      try {
        (api.constants as any).SQLITE_OK = 42;
        same(api.constants.SQLITE_OK, 42);
      } finally {
        (api.constants as any).SQLITE_OK = old;
      }
    },
    constructors(api) {
      for (const [name, ctor] of [
        ["DatabaseSync", api.DatabaseSync],
        ["StatementSync", api.StatementSync],
      ] as const) {
        same(ctor.name, name);
        same(ctor.length, 0);
        equal(Object.getOwnPropertyNames(ctor).sort(), [
          "length",
          "name",
          "prototype",
        ]);
        equal(Object.getOwnPropertyNames(ctor.prototype), ["constructor"]);
        same(ctor.prototype.constructor, ctor);
        for (const args of [[], [":memory:"], [null], [{}, {}]]) {
          failure(
            () => Reflect.construct(ctor, args),
            "TypeError",
            "Illegal constructor",
          );
          failure(
            () => Reflect.apply(ctor, {}, args),
            "TypeError",
            "Illegal constructor",
          );
        }
      }
    },
    backup(api) {
      same(api.backup.name, "bound backup");
      same(api.backup.length, 0);
      equal(Object.getOwnPropertyNames(api.backup).sort(), ["length", "name"]);
      for (const args of [[], [null], [{}, "file"]])
        failure(
          () => Reflect.apply(api.backup, undefined, args),
          "Error",
          "backup is not implemented",
        );
    },
  },
};
export class SqliteImplementation extends FeatureImplementation<
  typeof sqliteFeature
> {
  constructor() {
    super(sqliteFeature, {
      exports: { status: "supported" },
      constants: { status: "supported" },
      constructors: { status: "supported" },
      backup: { status: "supported" },
    });
  }
  create() {
    return sqlite;
  }
}
