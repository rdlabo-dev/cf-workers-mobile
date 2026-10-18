import { kvTextFeature, kvFeature } from "../bindings/kv/index.js";
import type { ContractSuite } from "../features/testing.js";
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
/** Requires an isolated, initially empty test namespace per case; writes key "key". */
export const kvTextContract: ContractSuite<typeof kvTextFeature> = {
  feature: kvTextFeature,
  cases: {
    async missing(api) {
      equal(await api.get("key"), null);
    },
    async roundtrip(api) {
      await api.put("key", "日本語 🍷");
      equal(await api.get("key"), "日本語 🍷");
    },
    async overwrite(api) {
      await api.put("key", "first");
      await api.put("key", "second");
      equal(await api.get("key"), "second");
    },
    async empty(api) {
      await api.put("key", "");
      equal(await api.get("key"), "");
    },
    async deleteMissing(api) {
      await api.delete("key");
      equal(await api.get("key"), null);
    },
    async delete(api) {
      await api.put("key", "value");
      await api.delete("key");
      equal(await api.get("key"), null);
    },
  },
};

/** Requires an empty test-only namespace; providers own data cleanup. */
export const kvContract: ContractSuite<typeof kvFeature> = {
  feature: kvFeature,
  cases: {
    ...kvTextContract.cases,
    async readModes(api) {
      await api.put("key", '{"hello":"日本語"}');
      equal(await api.get("key", "text"), '{"hello":"日本語"}');
      equal(await api.get("key", { type: "json", cacheTtl: 30 }), {
        hello: "日本語",
      });
    },
    async binary(api) {
      const bytes = new Uint8Array([0, 255, 128, 1]);
      await api.put("key", bytes.buffer);
      equal(
        [...new Uint8Array((await api.get("key", "arrayBuffer"))!)],
        [...bytes],
      );
    },
    async stream(api) {
      await api.put(
        "key",
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new Uint8Array([1, 2]));
            c.enqueue(new Uint8Array([3]));
            c.close();
          },
        }),
      );
      const stream = await api.get("key", "stream");
      equal(
        [...new Uint8Array(await new Response(stream).arrayBuffer())],
        [1, 2, 3],
      );
    },
    async metadata(api) {
      await api.put("key", '{"value":1}', { metadata: { version: 2 } });
      const result = await api.getWithMetadata("key", "json");
      equal(result.value, { value: 1 });
      equal(result.metadata, { version: 2 });
      await api.put("key", "new");
      equal((await api.getWithMetadata("key")).metadata, null);
    },
    async missingMetadata(api) {
      const result = await api.getWithMetadata("key");
      equal(result.value, null);
      equal(result.metadata, null);
    },
    async bulk(api) {
      await api.put("key", "42");
      const text = await api.get(["key", "absent"]);
      equal(
        [...text],
        [
          ["key", "42"],
          ["absent", null],
        ],
      );
      const json = await api.get(["key", "absent"], "json");
      equal(
        [...json],
        [
          ["key", 42],
          ["absent", null],
        ],
      );
    },
    async bulkMetadata(api) {
      await api.put("key", "42", { metadata: { tag: "a" } });
      const result = await api.getWithMetadata(["key", "absent"], "json");
      equal(result.get("key")?.value, 42);
      equal(result.get("key")?.metadata, { tag: "a" });
      equal(result.get("absent"), null);
    },
    async list(api) {
      await api.put("a:2", "two");
      await api.put("a:1", "one", { metadata: { order: 1 } });
      await api.put("other", "skip");
      const first = await api.list({ prefix: "a:", limit: 1 });
      equal(
        first.keys.map((k) => k.name),
        ["a:1"],
      );
      equal(first.keys[0].metadata, { order: 1 });
      if (first.list_complete)
        throw new Error("Expected a continuation cursor");
      const next = await api.list({
        prefix: "a:",
        limit: 1,
        cursor: first.cursor,
      });
      equal(
        next.keys.map((k) => k.name),
        ["a:2"],
      );
      // Some backends may need an empty final page to establish completion.
      if (!next.list_complete) {
        const last = await api.list({ prefix: "a:", cursor: next.cursor });
        equal(last.keys, []);
        equal(last.list_complete, true);
      }
    },
    async expiration(api) {
      const expiration = Math.floor(Date.now() / 1000) + 120;
      await api.put("absolute", "value", { expiration });
      await api.put("relative", "value", { expirationTtl: 120 });
      const listed = await api.list();
      equal(
        listed.keys.find((k) => k.name === "absolute")?.expiration,
        expiration,
      );
      const ttl = listed.keys.find((k) => k.name === "relative")?.expiration;
      if (!ttl || Math.abs(ttl - expiration) > 5)
        throw new Error("Invalid TTL expiration");
    },
    async unicodeKeys(api) {
      await api.put("key", "plain");
      await api.put("\uFEFFkey", "bom-prefix");
      await api.put("\uFEFF", "bom-only");
      equal(await api.get("key"), "plain");
      equal(await api.get("\uFEFFkey"), "bom-prefix");
      equal(await api.get("\uFEFF"), "bom-only");
      equal(
        (await api.list()).keys.map((key) => key.name),
        ["key", "\uFEFF", "\uFEFFkey"],
      );
      equal(
        (await api.list({ prefix: "\uFEFF" })).keys.map((key) => key.name),
        ["\uFEFF", "\uFEFFkey"],
      );
      await api.delete("\uFEFFkey");
      await api.delete("\uFEFF");
      equal(await api.get("key"), "plain");
      equal(
        (await api.list()).keys.map((key) => key.name),
        ["key"],
      );
    },
    async unicodeValues(api) {
      await api.put("key", "\uFEFFhello");
      equal(await api.get("key"), "\uFEFFhello");
      equal((await api.getWithMetadata("key")).value, "\uFEFFhello");
      equal((await api.get(["key"])).get("key"), "hello");
      equal((await api.getWithMetadata(["key"])).get("key")?.value, "hello");
      await api.put("json", '\uFEFF{"a":1}');
      for (const read of [
        () => api.get("json", "json"),
        () => api.getWithMetadata("json", "json"),
      ]) {
        let rejected = false;
        try {
          await read();
        } catch {
          rejected = true;
        }
        equal(rejected, true);
      }
      equal((await api.get(["json"], "json")).get("json"), { a: 1 });
      equal((await api.getWithMetadata(["json"], "json")).get("json")?.value, {
        a: 1,
      });
    },
    async invalidJson(api) {
      await api.put("key", "invalid json");
      let rejected = false;
      try {
        await api.get("key", "json");
      } catch {
        rejected = true;
      }
      equal(rejected, true);
    },
  },
};
