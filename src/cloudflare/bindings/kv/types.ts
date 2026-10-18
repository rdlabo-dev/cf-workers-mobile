export type KVReadType = "text" | "json" | "arrayBuffer" | "stream";
export interface KVReadOptions<T extends KVReadType = KVReadType> {
  type?: T;
  cacheTtl?: number;
}
export interface KVPutOptions {
  expiration?: number;
  expirationTtl?: number;
  metadata?: unknown;
}
export interface KVListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
}
export interface KVValue<T, M = unknown> {
  value: T | null;
  metadata: M | null;
}
export interface KVKey<M = unknown> {
  name: string;
  expiration?: number;
  metadata?: M;
}
export type KVListResult<M = unknown> = {
  keys: KVKey<M>[];
} & ({ list_complete: true } | { list_complete: false; cursor: string });

/** Public local KV contract, independent of any storage backend. */
export interface KVNamespace {
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
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream<Uint8Array>,
    options?: KVPutOptions,
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list<M = unknown>(options?: KVListOptions): Promise<KVListResult<M>>;
}
