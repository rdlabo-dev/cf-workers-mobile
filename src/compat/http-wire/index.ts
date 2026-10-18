import binary from "./wasm.js";

interface ParserExports {
  memory: WebAssembly.Memory;
  llhttp_alloc(type: number): number;
  llhttp_free(pointer: number): void;
  malloc(size: number): number;
  free(pointer: number): void;
  llhttp_execute(pointer: number, input: number, size: number): number;
  llhttp_finish(pointer: number): number;
  llhttp_get_error_reason(pointer: number): number;
}
export interface ResponseHead {
  status: number;
  statusText: string;
  headers: [string, string][];
  hasBody: boolean;
}
let module: WebAssembly.Module | undefined;
const limit = 65536;
/** Strict llhttp parser. A feed owns at most one native read (64 KiB). */
export class HttpResponseParser {
  head?: ResponseHead;
  complete = false;
  readonly chunks: Uint8Array<ArrayBuffer>[] = [];
  private readonly wasm: ParserExports;
  private readonly pointer: number;
  private readonly input: number;
  private statusText = "";
  private headers: [string, string][] = [];
  private field = "";
  private value = "";
  private inValue = false;
  private headerBytes = 0;
  private disposed = false;
  constructor(method: string) {
    module ??= new WebAssembly.Module(
      Uint8Array.from(atob(binary), (c) => c.charCodeAt(0)),
    );
    const text = (at: number, length: number) => {
      this.headerBytes += length;
      if (this.headerBytes > limit)
        throw new TypeError("HTTP headers exceed 64 KiB");
      const bytes = new Uint8Array(this.wasm.memory.buffer, at, length);
      let result = "";
      for (const byte of bytes) result += String.fromCharCode(byte);
      return result;
    };
    const flush = () => {
      if (this.field) this.headers.push([this.field, this.value]);
      this.field = "";
      this.value = "";
      this.inValue = false;
    };
    this.wasm = new WebAssembly.Instance(module, {
      env: {
        wasm_on_url: () => 0,
        wasm_on_message_begin: () => {
          this.statusText = "";
          this.headers = [];
          return 0;
        },
        wasm_on_status: (_: number, at: number, len: number) => {
          this.statusText += text(at, len);
          return 0;
        },
        wasm_on_header_field: (_: number, at: number, len: number) => {
          if (this.inValue) flush();
          this.field += text(at, len);
          return 0;
        },
        wasm_on_header_value: (_: number, at: number, len: number) => {
          this.inValue = true;
          this.value += text(at, len);
          return 0;
        },
        wasm_on_headers_complete: (
          _: number,
          status: number,
          upgrade: number,
        ) => {
          flush();
          if (upgrade || status === 101)
            throw new TypeError("HTTP upgrade is not a Fetch response");
          if (status < 200) return 0;
          const hasBody =
            method !== "HEAD" && ![204, 205, 304].includes(status);
          this.head = {
            status,
            statusText: this.statusText,
            headers: this.headers,
            hasBody,
          };
          // Trailer callbacks must not mutate the already published headers.
          this.headers = [];
          return hasBody ? 0 : 1;
        },
        wasm_on_body: (_: number, at: number, len: number) => {
          this.chunks.push(
            new Uint8Array(this.wasm.memory.buffer, at, len).slice(),
          );
          return 0;
        },
        wasm_on_message_complete: () => {
          flush();
          if (!this.head) return 0;
          this.complete = true;
          return 21; // HPE_PAUSED: never interpret unsolicited pipelined responses.
        },
      },
    }).exports as unknown as ParserExports;
    this.pointer = this.wasm.llhttp_alloc(2);
    this.input = this.wasm.malloc(limit);
    if (!this.pointer || !this.input) {
      this.dispose();
      throw new Error("HTTP parser allocation failed");
    }
  }
  private check(code: number) {
    if (code === 0 || (code === 21 && this.complete)) return;
    const at = this.wasm.llhttp_get_error_reason(this.pointer);
    const bytes = new Uint8Array(this.wasm.memory.buffer, at);
    const end = bytes.indexOf(0);
    throw new TypeError(
      `Invalid HTTP response: ${new TextDecoder().decode(bytes.subarray(0, end < 0 ? 0 : end))}`,
    );
  }
  feed(bytes: Uint8Array) {
    if (this.disposed) throw new Error("HTTP parser is closed");
    if (bytes.length > limit) throw new RangeError("HTTP input exceeds 64 KiB");
    if (this.complete) return;
    new Uint8Array(this.wasm.memory.buffer, this.input, bytes.length).set(
      bytes,
    );
    this.check(
      this.wasm.llhttp_execute(this.pointer, this.input, bytes.length),
    );
  }
  finish() {
    if (this.disposed) throw new Error("HTTP parser is closed");
    if (!this.complete) this.check(this.wasm.llhttp_finish(this.pointer));
    if (!this.complete)
      throw new TypeError("HTTP response ended before final headers");
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.wasm.llhttp_free(this.pointer);
    this.wasm.free(this.input);
    this.chunks.length = 0;
  }
}
