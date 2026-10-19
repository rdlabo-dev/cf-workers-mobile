import { LocalStorageKV } from "workers-capacitor/cloudflare/bindings/kv";
import {
  FeatureImplementation,
  FeatureUnavailable,
  type FeatureScope,
} from "workers-capacitor/shared/contracts";
import {
  kvFeature,
  type KVNamespace,
} from "workers-capacitor/cloudflare/bindings/kv";
import { wasmFeature } from "./contracts/wasm";

/** Test-only cleanup. Production feature disposal never clears application data. */
async function clear(kv: KVNamespace) {
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const result = await kv.list({ cursor });
    names.push(...result.keys.map((key) => key.name));
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);
  await Promise.all(names.map((key) => kv.delete(key)));
}
export class PersistentText extends LocalStorageKV {
  constructor() {
    super(`test-${crypto.randomUUID()}`);
  }
  override create(scope?: FeatureScope): KVNamespace {
    const api = super.create();
    scope?.defer(() => clear(api));
    return api;
  }
}
/** Owns the entire ephemeral workerd test binding, never a production namespace. */
export class WorkersText extends FeatureImplementation<typeof kvFeature> {
  constructor(private readonly kv: KVNamespace) {
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
  }
  async create(scope: FeatureScope): Promise<KVNamespace> {
    scope.defer(() => clear(this.kv));
    await clear(this.kv);
    return this.kv;
  }
}

export class WasmValidation extends FeatureImplementation<typeof wasmFeature> {
  constructor() {
    super(wasmFeature, {
      valid: { status: "supported" },
      invalid: { status: "supported" },
    });
  }
  create() {
    if (
      typeof WebAssembly === "undefined" ||
      typeof WebAssembly.validate !== "function"
    )
      throw new FeatureUnavailable("WebAssembly.validate is unavailable");
    return {
      validate: (bytes: Uint8Array<ArrayBuffer>) => WebAssembly.validate(bytes),
    };
  }
}
