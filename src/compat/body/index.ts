import { platform } from "../globals/platform.js";
import type { Headers } from "../headers/index.js";

// Capture platform body codecs before any runtime globals are installed.
const PlatformResponse = platform.Response;
/** Workers clones cf through JSON and requires an object before and after cloning. */
export function cloneValue(value: Record<string, unknown> | undefined) {
  if (value === undefined) return undefined;
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  )
    throw new TypeError("cf must be an object");
  const copy = JSON.parse(JSON.stringify(value));
  if (copy === null || typeof copy !== "object")
    throw new Error("Cloned cf must be an object");
  return copy as Record<string, unknown>;
}
export function dictionary<T extends object>(value: T): T {
  if (value == null) return {} as T;
  if (typeof value !== "object" && typeof value !== "function")
    throw new TypeError("Expected an object");
  return value;
}
export function webString(value: unknown): string {
  if (typeof value === "symbol")
    throw new TypeError("Cannot convert a Symbol to a string");
  return String(value);
}

const bodies = new WeakMap<
  Body,
  { response: globalThis.Response; headers: Headers; rewindable: boolean }
>();
function state(body: Body) {
  const value = bodies.get(body);
  if (!value) throw new TypeError("Illegal invocation");
  return value;
}
export function hasBody(body: Body) {
  return state(body).response.body !== null;
}
export function cloneBody(body: Body) {
  return state(body).response.clone().body;
}
export function moveBody(body: Body) {
  const original = state(body).response;
  if (original.bodyUsed || original.body?.locked)
    throw new TypeError("Body has already been used.");
  return (
    original.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>()) ??
    null
  );
}
export function inheritBodySource(target: Body, source: Body) {
  state(target).rewindable = state(source).rewindable;
}
export function replayBody(body: Body) {
  const original = state(body);
  if (!original.rewindable) return;
  const template = original.response.clone();
  return () => template.clone().body;
}
export function setBodyHeaders(body: Body, headers: Headers) {
  state(body).headers = headers;
}
/** Internal body ownership and codecs shared by Request and Response. */
export abstract class Body {
  protected constructor(body: BodyInit | null | undefined, headers: Headers) {
    bodies.set(this, {
      response: new PlatformResponse(body),
      headers,
      rewindable: !(body instanceof ReadableStream),
    });
    const contentType = state(this).response.headers.get("content-type");
    if (contentType && !headers.has("content-type"))
      headers.set("content-type", contentType);
  }
  get body() {
    return state(this).response.body;
  }
  get bodyUsed() {
    return state(this).response.bodyUsed;
  }
  arrayBuffer() {
    return state(this).response.arrayBuffer();
  }
  async bytes() {
    return new Uint8Array(await state(this).response.arrayBuffer());
  }
  async #text() {
    return new TextDecoder().decode(await state(this).response.arrayBuffer());
  }
  text() {
    return this.#text();
  }
  async json() {
    return JSON.parse(await this.#text());
  }
  #updateContentType() {
    const type = state(this).headers.get("content-type");
    if (type === null) state(this).response.headers.delete("content-type");
    else state(this).response.headers.set("content-type", type);
  }
  async formData() {
    this.#updateContentType();
    return state(this).response.formData();
  }
  async blob() {
    this.#updateContentType();
    return state(this).response.blob();
  }
}
for (const key of Object.getOwnPropertyNames(Body.prototype))
  if (key !== "constructor")
    Object.defineProperty(Body.prototype, key, { enumerable: true });
