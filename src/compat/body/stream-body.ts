import { platform } from "../globals/platform.js";
import { ReadableStream, disturbed } from "../stream-web/runtime.js";
import { readable } from "../stream-web/interop.js";

/** Body ownership for the BYOB-capable JS streams used by iOS 26.1. */
export class StreamBody {
  #body: globalThis.ReadableStream<Uint8Array> | null;
  headers: globalThis.Headers;
  constructor(body: BodyInit | null | undefined) {
    if (body instanceof ReadableStream) {
      if (body.locked || disturbed(body))
        throw new TypeError("Body has already been used.");
      this.#body = body;
      this.headers = new platform.Headers();
    } else {
      const response = new platform.Response(body);
      this.#body = response.body && readable(response.body);
      this.headers = response.headers;
    }
  }
  get body() {
    return this.#body;
  }
  get bodyUsed() {
    return this.#body !== null && disturbed(this.#body);
  }
  clone(): StreamBody {
    if (this.bodyUsed || this.#body?.locked)
      throw new TypeError("Body has already been used.");
    const clone = new StreamBody(null);
    clone.headers = new platform.Headers(this.headers);
    if (this.#body) [this.#body, clone.#body] = this.#body.tee();
    return clone;
  }
  async arrayBuffer(): Promise<ArrayBuffer> {
    if (this.bodyUsed || this.#body?.locked)
      throw new TypeError("Body has already been used.");
    if (!this.#body) return new ArrayBuffer(0);
    const reader = this.#body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!(value instanceof Uint8Array))
          throw new TypeError("ReadableStream did not return bytes");
        const copy = value.slice();
        chunks.push(copy);
        length += copy.byteLength;
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes.buffer;
  }
  async blob() {
    return new platform.Response(await this.arrayBuffer(), {
      headers: this.headers,
    }).blob();
  }
  async formData() {
    return new platform.Response(await this.arrayBuffer(), {
      headers: this.headers,
    }).formData();
  }
}
