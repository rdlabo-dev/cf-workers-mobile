import binary from "./native-cipher.wasm";
type API = Record<string, (...args: any[]) => any> & {
  memory: WebAssembly.Memory;
};
let instance: API | undefined;
export function library(): API {
  if (instance) return instance;
  let api: API;
  api = new WebAssembly.Instance(
    new WebAssembly.Module(binary as BufferSource),
    {
      env: { emscripten_notify_memory_growth() {} },
      wasi_snapshot_preview1: {
        random_get(pointer: number, length: number) {
          for (let offset = 0; offset < length; offset += 65536)
            globalThis.crypto.getRandomValues(
              new Uint8Array(
                api.memory.buffer,
                pointer + offset,
                Math.min(65536, length - offset),
              ),
            );
          return 0;
        },
        fd_close() {
          return 8;
        },
        fd_write() {
          return 8;
        },
        fd_seek() {
          return 8;
        },
      },
    },
  ).exports as API;
  api._initialize();
  instance = api;
  return api;
}
export function inputs<T>(
  values: (string | Uint8Array | number)[],
  operation: (api: API, pointers: number[]) => T,
): T {
  const api = library(),
    allocated: { pointer: number; length: number }[] = [];
  try {
    const pointers = values.map((value) => {
      const data =
        typeof value === "string"
          ? new TextEncoder().encode(value + "\0")
          : typeof value === "number"
            ? undefined
            : value;
      const length = typeof value === "number" ? value : data!.byteLength;
      const pointer = api.malloc(Math.max(1, length));
      if (!pointer) throw new RangeError("Memory limit exceeded");
      allocated.push({ pointer, length });
      const memory = new Uint8Array(api.memory.buffer, pointer, length);
      if (data) memory.set(data);
      else memory.fill(0);
      return pointer;
    });
    return operation(api, pointers);
  } finally {
    for (const { pointer, length } of allocated) {
      new Uint8Array(api.memory.buffer, pointer, length).fill(0);
      api.free(pointer);
    }
  }
}
export function output(api: API, pointer: number, length: number): Uint8Array {
  return new Uint8Array(api.memory.buffer, pointer, length).slice();
}
export function size(api: API, pointer: number): number {
  return new DataView(api.memory.buffer).getUint32(pointer, true);
}
