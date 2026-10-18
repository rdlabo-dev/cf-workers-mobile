import type { KVNamespace, KVValue } from "../../src/bindings/kv/index.js";

// Alternative backends are checked against the independent public contract.
function checkBackend(api: KVNamespace) {
  const text: Promise<string | null> = api.get("key");
  const bytes: Promise<ArrayBuffer | null> = api.get("key", "arrayBuffer");
  const stream: Promise<ReadableStream<Uint8Array> | null> = api.get(
    "key",
    "stream",
  );
  const json: Promise<{ n: number } | null> = api.get<{ n: number }>(
    "key",
    "json",
  );
  const bulk: Promise<Map<string, KVValue<string, { tag: string }> | null>> =
    api.getWithMetadata<{ tag: string }>(["key"]);
  // @ts-expect-error Bulk streaming is outside the contract.
  void api.get(["key"], "stream");
  // @ts-expect-error JSON mode cannot silently return text.
  const wrong: Promise<string | null> = api.get<{ n: number }>("key", "json");
  // @ts-expect-error Every backend must implement the metadata operation.
  const incomplete: KVNamespace = {
    get: api.get,
    put: api.put,
    delete: api.delete,
    list: api.list,
  };
  void [text, bytes, stream, json, bulk, wrong, incomplete];
}
void checkBackend;
