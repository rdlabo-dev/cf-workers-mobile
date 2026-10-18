import {
  defineFeature,
  FeatureImplementation,
  FeatureUnavailable,
} from "../../../contracts/index.js";

/** Single-key text subset of a Workers KV namespace. */
export interface KVTextNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
export const kvTextFeature = defineFeature<KVTextNamespace>()("kv.text.v1", [
  "missing",
  "roundtrip",
  "delete",
  "overwrite",
  "empty",
  "deleteMissing",
]);

export type { KVNamespace } from "./types.js";
export type {
  KVReadOptions,
  KVReadType,
  KVPutOptions,
  KVListOptions,
  KVListResult,
  KVValue,
  KVKey,
} from "./types.js";
import { StorageNamespace } from "./storage.js";
import type { KVNamespace } from "./types.js";
export const kvFeature = defineFeature<KVNamespace>()("kv.local.v1", [
  ...kvTextFeature.cases,
  "readModes",
  "binary",
  "stream",
  "metadata",
  "missingMetadata",
  "bulk",
  "bulkMetadata",
  "list",
  "expiration",
  "invalidJson",
  "unicodeKeys",
  "unicodeValues",
]);
export class LocalStorageKV extends FeatureImplementation<typeof kvFeature> {
  constructor(
    private readonly namespace: string,
    private readonly storage?: Storage,
  ) {
    super(kvFeature, {
      missing: { status: "supported" },
      roundtrip: { status: "supported" },
      delete: { status: "supported" },
      overwrite: { status: "supported" },
      empty: { status: "supported" },
      deleteMissing: { status: "supported" },
      readModes: { status: "supported" },
      binary: { status: "supported" },
      stream: { status: "supported" },
      metadata: { status: "supported" },
      missingMetadata: { status: "supported" },
      bulk: { status: "supported" },
      bulkMetadata: { status: "supported" },
      list: { status: "supported" },
      expiration: { status: "supported" },
      invalidJson: { status: "supported" },
      unicodeKeys: { status: "supported" },
      unicodeValues: { status: "supported" },
    });
    if (typeof namespace !== "string" || !namespace.length)
      throw new TypeError("KV namespace must be a nonempty string");
  }
  create(): KVNamespace {
    const storage = this.storage ?? globalThis.localStorage;
    if (!storage) throw new FeatureUnavailable("localStorage is unavailable");
    return new StorageNamespace(this.namespace, storage);
  }
}
