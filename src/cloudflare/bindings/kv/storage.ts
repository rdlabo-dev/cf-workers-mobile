import type {
  KVNamespace,
  KVReadOptions,
  KVReadType,
  KVPutOptions,
  KVListOptions,
  KVListResult,
  KVValue,
  KVKey,
} from "./types.js";
const encoder = new TextEncoder();
// KV preserves leading U+FEFF in both keys and values.
const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
// Actual Workers bulk reads strip BOM, unlike single-key reads.
const bulkDecoder = new TextDecoder();
const maxValue = 25 * 1024 * 1024;
function byteString(bytes: Uint8Array) {
  let result = "";
  for (let i = 0; i < bytes.length; i += 8192)
    result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return result;
}
function encode(bytes: Uint8Array) {
  return btoa(byteString(bytes));
}
function decode(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
function keyName(key: string) {
  if (
    typeof key !== "string" ||
    !key ||
    key === "." ||
    key === ".." ||
    encoder.encode(key).length > 512
  )
    throw new TypeError(
      "KV key must be 1–512 UTF-8 bytes and cannot be . or ..",
    );
  return decoder.decode(encoder.encode(key));
}
function optionsObject(value: unknown, fields: string[]) {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("KV options must be an object");
  if (Object.keys(value).some((key) => !fields.includes(key)))
    throw new TypeError("Unsupported KV option");
}
function readType(options?: KVReadType | KVReadOptions): KVReadType {
  if (typeof options === "string") {
    if (!["text", "json", "arrayBuffer", "stream"].includes(options))
      throw new TypeError("Unsupported KV read type");
    return options;
  }
  optionsObject(options, ["type", "cacheTtl"]);
  if (
    options?.cacheTtl !== undefined &&
    (!Number.isInteger(options.cacheTtl) || options.cacheTtl < 30)
  )
    throw new TypeError("cacheTtl must be an integer of at least 30 seconds");
  const type = options?.type;
  if (type === undefined) return "text";
  if (
    typeof type !== "string" ||
    !["text", "json", "arrayBuffer", "stream"].includes(type)
  )
    throw new TypeError("Unsupported KV read type");
  return type;
}
interface RecordValue {
  data: string;
  expiration?: number;
  metadata?: unknown;
}

/** Storage and guardrails for the local KV binding; no test-runner dependency. */
export class StorageNamespace implements KVNamespace {
  private readonly prefix: string;
  constructor(
    namespace: string,
    private readonly storage: Storage,
  ) {
    this.prefix = `workers-capacitor/kv-v1/${JSON.stringify(namespace)}:`;
  }
  private record(key: string): RecordValue | null {
    const name = this.prefix + keyName(key);
    const raw = this.storage.getItem(name);
    if (raw === null) return null;
    const record = JSON.parse(raw) as RecordValue;
    if (
      !record ||
      typeof record.data !== "string" ||
      (record.expiration !== undefined && !Number.isInteger(record.expiration))
    )
      throw new Error("Invalid stored KV record");
    if (
      record.expiration !== undefined &&
      record.expiration <= Math.floor(Date.now() / 1000)
    ) {
      this.storage.removeItem(name);
      return null;
    }
    return record;
  }
  private read(
    record: RecordValue | null,
    type: KVReadType,
    textDecoder = decoder,
  ): KVValue<unknown> {
    if (!record) return { value: null, metadata: null };
    if (type === "stream") {
      // Storage necessarily returns a string, but decode only on demand. Keep
      // base64 groups intact and release the encoded value on cancel/EOF.
      let data = record.data;
      let offset = 0;
      const value = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            const end = Math.min(offset + 65536, data.length);
            if (end > offset)
              controller.enqueue(decode(data.slice(offset, end)));
            offset = end;
            if (offset === data.length) {
              data = "";
              controller.close();
            }
          },
          cancel() {
            data = "";
          },
        },
        { highWaterMark: 0 },
      );
      return { value, metadata: record.metadata ?? null };
    }
    const bytes = decode(record.data);
    const value =
      type === "arrayBuffer"
        ? bytes.buffer
        : type === "json"
          ? JSON.parse(textDecoder.decode(bytes))
          : textDecoder.decode(bytes);
    return { value, metadata: record.metadata ?? null };
  }
  private readMany(keys: string[], type: KVReadType, metadata: boolean) {
    if (keys.length > 100)
      throw new TypeError("KV bulk reads allow at most 100 keys");
    if (type !== "text" && type !== "json")
      throw new TypeError("KV bulk reads support only text and json");
    const results = new Map<string, unknown>();
    let bytes = 0;
    for (const key of keys) {
      const record = this.record(key);
      const result =
        metadata && !record ? null : this.read(record, type, bulkDecoder);
      const item = metadata ? result : result!.value;
      bytes += encoder.encode(JSON.stringify(item)).length;
      if (bytes > maxValue)
        throw new RangeError("KV bulk response exceeds 25 MiB");
      results.set(key, item);
    }
    return results;
  }
  get(
    key: string,
    options?: "text" | KVReadOptions<"text">,
  ): Promise<string | null>;
  get<T = unknown>(
    key: string,
    options: "json" | KVReadOptions<"json">,
  ): Promise<T | null>;
  get(
    key: string,
    options: "arrayBuffer" | KVReadOptions<"arrayBuffer">,
  ): Promise<ArrayBuffer | null>;
  get(
    key: string,
    options: "stream" | KVReadOptions<"stream">,
  ): Promise<ReadableStream<Uint8Array> | null>;
  get(
    keys: string[],
    options?: "text" | KVReadOptions<"text">,
  ): Promise<Map<string, string | null>>;
  get<T = unknown>(
    keys: string[],
    options: "json" | KVReadOptions<"json">,
  ): Promise<Map<string, T | null>>;
  async get(
    key: string | string[],
    options?: KVReadType | KVReadOptions,
  ): Promise<unknown> {
    const type = readType(options);
    return Array.isArray(key)
      ? this.readMany(key, type, false)
      : this.read(this.record(key), type).value;
  }
  getWithMetadata<M = unknown>(
    key: string,
    options?: "text" | KVReadOptions<"text">,
  ): Promise<KVValue<string, M>>;
  getWithMetadata<T = unknown, M = unknown>(
    key: string,
    options: "json" | KVReadOptions<"json">,
  ): Promise<KVValue<T, M>>;
  getWithMetadata<M = unknown>(
    key: string,
    options: "arrayBuffer" | KVReadOptions<"arrayBuffer">,
  ): Promise<KVValue<ArrayBuffer, M>>;
  getWithMetadata<M = unknown>(
    key: string,
    options: "stream" | KVReadOptions<"stream">,
  ): Promise<KVValue<ReadableStream<Uint8Array>, M>>;
  getWithMetadata<M = unknown>(
    keys: string[],
    options?: "text" | KVReadOptions<"text">,
  ): Promise<Map<string, KVValue<string, M> | null>>;
  getWithMetadata<T = unknown, M = unknown>(
    keys: string[],
    options: "json" | KVReadOptions<"json">,
  ): Promise<Map<string, KVValue<T, M> | null>>;
  async getWithMetadata(
    key: string | string[],
    options?: KVReadType | KVReadOptions,
  ): Promise<unknown> {
    const type = readType(options);
    return Array.isArray(key)
      ? this.readMany(key, type, true)
      : this.read(this.record(key), type);
  }
  async put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream<Uint8Array>,
    options?: KVPutOptions,
  ): Promise<void> {
    const name = this.prefix + keyName(key);
    optionsObject(options, ["expiration", "expirationTtl", "metadata"]);
    const { expiration: absoluteExpiration, expirationTtl } = options ?? {};
    const now = Math.floor(Date.now() / 1000);
    if (
      absoluteExpiration !== undefined &&
      (!Number.isInteger(absoluteExpiration) || absoluteExpiration < now + 60)
    )
      throw new TypeError(
        "expiration must be an integer at least 60 seconds in the future",
      );
    if (
      expirationTtl !== undefined &&
      (!Number.isInteger(expirationTtl) || expirationTtl < 60)
    )
      throw new TypeError(
        "expirationTtl must be an integer of at least 60 seconds",
      );
    let metadata: unknown;
    if (options?.metadata !== undefined) {
      const serialized = JSON.stringify(options.metadata);
      if (serialized === undefined)
        throw new TypeError("KV metadata must be JSON serializable");
      if (encoder.encode(serialized).length > 1024)
        throw new RangeError("KV metadata exceeds 1024 bytes");
      metadata = JSON.parse(serialized);
    }
    let bytes: Uint8Array;
    let encodedStream: string | undefined;
    if (typeof value === "string") bytes = encoder.encode(value);
    else if (value instanceof ArrayBuffer) {
      if (value.byteLength > maxValue)
        throw new RangeError("KV value exceeds 25 MiB");
      bytes = new Uint8Array(value);
    } else if (ArrayBuffer.isView(value)) {
      if (value.byteLength > maxValue)
        throw new RangeError("KV value exceeds 25 MiB");
      bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    } else if (value instanceof ReadableStream) {
      const reader = value.getReader();
      const parts: string[] = [];
      let carry = new Uint8Array(0);
      let size = 0;
      try {
        while (true) {
          const item = await reader.read();
          if (item.done) break;
          if (!(item.value instanceof Uint8Array))
            throw new TypeError("KV stream must contain bytes");
          size += item.value.byteLength;
          if (size > maxValue) throw new RangeError("KV value exceeds 25 MiB");
          // Only a two-byte remainder crosses input chunks; no whole-value
          // decoded copy or concatenation buffer is retained.
          let offset = 0;
          if (carry.length) {
            const take = Math.min(3 - carry.length, item.value.length);
            const joined = new Uint8Array(carry.length + take);
            joined.set(carry);
            joined.set(item.value.subarray(0, take), carry.length);
            offset = take;
            carry = joined;
            if (carry.length === 3) {
              parts.push(encode(carry));
              carry = new Uint8Array(0);
            }
          }
          for (; offset + 3 <= item.value.length; ) {
            const end =
              offset +
              Math.min(49152, Math.floor((item.value.length - offset) / 3) * 3);
            parts.push(encode(item.value.subarray(offset, end)));
            offset = end;
          }
          if (offset < item.value.length) carry = item.value.slice(offset);
        }
      } catch (error) {
        try {
          await reader.cancel(error);
        } catch {
          /* Preserve the original read/limit error. */
        }
        throw error;
      } finally {
        reader.releaseLock();
      }
      if (carry.length) parts.push(encode(carry));
      encodedStream = parts.join("");
      bytes = new Uint8Array(0);
    } else throw new TypeError("KV value must be text, bytes or a byte stream");
    if (bytes.length > maxValue)
      throw new RangeError("KV value exceeds 25 MiB");
    const data = encodedStream ?? encode(bytes);
    const committedAt = Math.floor(Date.now() / 1000);
    const expiration =
      expirationTtl !== undefined
        ? committedAt + expirationTtl
        : absoluteExpiration;
    if (expiration !== undefined && expiration <= committedAt)
      throw new TypeError(
        "expiration elapsed before the value could be stored",
      );
    // One write publishes value, metadata and expiration together, only after validation.
    this.storage.setItem(name, JSON.stringify({ data, expiration, metadata }));
  }
  async delete(key: string): Promise<void> {
    this.storage.removeItem(this.prefix + keyName(key));
  }
  async list<M = unknown>(options?: KVListOptions): Promise<KVListResult<M>> {
    optionsObject(options, ["prefix", "limit", "cursor"]);
    const prefix = options?.prefix === undefined ? "" : options.prefix;
    const limit = options?.limit === undefined ? 1000 : options.limit;
    if (
      typeof prefix !== "string" ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 1000
    )
      throw new TypeError(
        "KV list needs a string prefix and limit between 1 and 1000",
      );
    let after: string | undefined;
    if (options?.cursor !== undefined && options.cursor !== "") {
      try {
        const cursor = JSON.parse(decoder.decode(decode(options.cursor)));
        if (
          cursor.namespace !== this.prefix ||
          cursor.prefix !== prefix ||
          typeof cursor.after !== "string"
        )
          throw new Error();
        after = cursor.after;
      } catch {
        throw new TypeError("Invalid KV cursor for this namespace/prefix");
      }
    }
    // UTF-8 byte ordering agrees with code-point ordering for valid Unicode.
    const compare = (a: string, b: string) => {
      const x = encoder.encode(a),
        y = encoder.encode(b);
      for (let i = 0; i < Math.min(x.length, y.length); i++)
        if (x[i] !== y[i]) return x[i] - y[i];
      return x.length - y.length;
    };
    const names: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith(this.prefix))
        names.push(key.slice(this.prefix.length));
    }
    const keys: KVKey<M>[] = [];
    for (const name of names.sort(compare)) {
      if (
        !name.startsWith(prefix) ||
        (after !== undefined && compare(name, after) <= 0)
      )
        continue;
      const record = this.record(name);
      if (!record) continue;
      keys.push({
        name,
        ...(record.expiration !== undefined
          ? { expiration: record.expiration }
          : {}),
        ...(record.metadata !== undefined
          ? { metadata: record.metadata as M }
          : {}),
      });
      if (keys.length > limit) break;
    }
    if (keys.length <= limit) return { keys, list_complete: true };
    keys.pop();
    return {
      keys,
      list_complete: false,
      cursor: encode(
        encoder.encode(
          JSON.stringify({
            namespace: this.prefix,
            prefix,
            after: keys[keys.length - 1].name,
          }),
        ),
      ),
    };
  }
}
