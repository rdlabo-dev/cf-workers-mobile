import { HttpResponseParser } from "../http-wire/index.js";
import { getHostCall } from "./host-call.js";
import type { NativeConnection, NativeNetwork } from "./transport.js";

export type NativeNetworkMethod =
  | "cookiesGet"
  | "cookiesSet"
  | "socketWatch"
  | "socketOpen"
  | "socketWrite"
  | "socketEnd"
  | "socketRead"
  | "socketClose";

/**
 * Narrowly typed bridge call. The same shape can be relayed through a Capacitor
 * bridge, a Dedicated Worker MessagePort, or the Android document-host
 * JavaScript interface.
 */
export type NativeCall = (
  plugin: string,
  method: NativeNetworkMethod,
  args: Record<string, unknown>,
) => Promise<unknown>;

export interface NativeNetworkOptions {
  /** Maximum number of bytes requested per `read()` (default 65536). */
  chunkSize?: number;
  /** Bridge call function; defaults to `globalThis.Capacitor.nativePromise`. */
  nativeCall?: NativeCall;
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

let overrideCall: NativeCall | undefined;
export function setNativeCall(call: NativeCall | undefined) {
  const previous = overrideCall;
  overrideCall = call;
  return () => {
    if (overrideCall === call) overrideCall = previous;
  };
}

/** Native bridge detection; ordinary browsers retain their browser transport. */
export function getNativeCall(): NativeCall | undefined {
  if (overrideCall) return overrideCall;
  const host = getHostCall();
  if (host) return host;
  const bridge = (
    globalThis as typeof globalThis & {
      Capacitor?: { nativePromise?: NativeCall; isNativePlatform?(): boolean };
    }
  ).Capacitor;
  if (!bridge?.nativePromise || bridge.isNativePlatform?.() === false) return;
  return bridge.nativePromise.bind(bridge);
}
function defaultNativeCall(): NativeCall {
  const call = getNativeCall();
  if (!call) throw new Error("Capacitor native bridge is not available");
  return call;
}

const CHUNK_SIZE = 65536;
const token = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
function encode(bytes: Uint8Array): string {
  let text = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(text);
}
function decode(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

/** HTTP policy/framing lives in JS. Native receives only bounded TCP/TLS bytes. */
export function createNativeNetwork(
  options: NativeNetworkOptions = {},
): NativeNetwork {
  const call = options.nativeCall ?? defaultNativeCall();
  const chunkSize = options.chunkSize ?? CHUNK_SIZE;
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > CHUNK_SIZE)
    throw new TypeError("chunkSize must be an integer between 1 and 65536");
  return {
    async open(request) {
      const url = new URL(request.url);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new TypeError(
          "Network transport requires an HTTP(S) URL without credentials",
        );
      if (!token.test(request.method) || request.method === "CONNECT")
        throw new TypeError("Invalid HTTP method");
      const pairs: [string, string][] = [];
      let host = false;
      let length: number | undefined;
      for (const [name, value] of request.headers) {
        if (!token.test(name) || /[^\t\x20-\x7e\x80-\xff]/.test(value))
          throw new TypeError("Invalid HTTP header");
        const key = name.toLowerCase();
        if (key === "content-length") {
          if (
            length !== undefined ||
            !/^\d+$/.test(value) ||
            !Number.isSafeInteger(Number(value))
          )
            throw new TypeError("Invalid Content-Length");
          length = Number(value);
          continue;
        }
        // This connection owns framing and never pools or upgrades.
        if (
          [
            "transfer-encoding",
            "connection",
            "proxy-connection",
            "upgrade",
          ].includes(key)
        )
          continue;
        if (key === "host") {
          if (host) throw new TypeError("Duplicate Host");
          host = true;
        }
        pairs.push([name, value]);
      }
      if (!host) pairs.push(["Host", url.host]);
      if (!request.hasBody && length && length > 0)
        throw new TypeError("Content-Length without a body");
      const chunked = request.hasBody && length === undefined;
      if (chunked) pairs.push(["Transfer-Encoding", "chunked"]);
      else if (
        length !== undefined ||
        request.hasBody ||
        ["POST", "PUT", "PATCH"].includes(request.method)
      )
        pairs.push(["Content-Length", String(length ?? 0)]);
      pairs.push(["Connection", "close"]);
      const head = `${request.method} ${url.pathname}${url.search} HTTP/1.1\r\n${pairs.map((pair) => pair.join(": ")).join("\r\n")}\r\n\r\n`;
      if (head.length > CHUNK_SIZE)
        throw new TypeError("HTTP request headers exceed 64 KiB");
      const parser = new HttpResponseParser(request.method);
      const id = randomId();
      let closing: Promise<void> | undefined;
      let ended = false,
        sent = 0;
      const close = () =>
        (closing ??= Promise.resolve().then(async () => {
          parser.dispose();
          await call("WorkersCapacitor", "socketClose", { id });
        }));
      const opening = Promise.resolve()
        .then(() =>
          call("WorkersCapacitor", "socketOpen", {
            id,
            host: url.hostname.replace(/^\[|\]$/g, ""),
            port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
            tls: url.protocol === "https:",
          }),
        )
        .then(async () => {
          if (closing) {
            await call("WorkersCapacitor", "socketClose", { id });
            throw new Error("HTTP connection closed");
          }
        });
      const writeBytes = async (bytes: Uint8Array) => {
        await opening;
        for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
          if (closing) throw new Error("HTTP connection closed");
          await call("WorkersCapacitor", "socketWrite", {
            id,
            chunk: encode(bytes.subarray(offset, offset + CHUNK_SIZE)),
          });
        }
      };
      const ready = writeBytes(Uint8Array.from(head, (c) => c.charCodeAt(0)));
      const pull = async () => {
        const result = (await call("WorkersCapacitor", "socketRead", {
          id,
          maxBytes: chunkSize,
        })) as { chunk?: string; eof?: boolean; reset?: boolean };
        if (closing) throw new Error("HTTP connection closed");
        if (!result || result.reset)
          throw new TypeError("HTTP connection reset");
        if (result.eof) {
          // Network.framework may report missing TLS close_notify as clean EOF.
          // Never authenticate a close-delimited HTTPS body using that signal.
          if (url.protocol === "https:" && !parser.complete)
            throw new TypeError(
              "TLS EOF without complete HTTP response framing",
            );
          parser.finish();
        } else if (typeof result.chunk === "string") {
          const bytes = decode(result.chunk);
          if (!bytes.length) throw new TypeError("Empty socket read");
          parser.feed(bytes);
        } else throw new TypeError("Invalid socket read result");
      };
      const headers = (async () => {
        await ready;
        while (!parser.head) await pull();
        return parser.head;
      })();
      void headers.catch(() => close().catch(() => {}));
      return {
        headers,
        async write(bytes) {
          await ready;
          if (!(bytes instanceof Uint8Array))
            throw new TypeError("Write chunk must be a Uint8Array");
          if (parser.complete) return; // A completed response cancels further upload.
          if (ended || closing) throw new Error("HTTP upload is closed");
          sent += bytes.length;
          if (length !== undefined && sent > length)
            throw new TypeError("Request exceeds Content-Length");
          if (!request.hasBody && bytes.length)
            throw new TypeError("Request has no body");
          for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
            const part = bytes.subarray(offset, offset + CHUNK_SIZE);
            try {
              if (chunked)
                await writeBytes(
                  new TextEncoder().encode(`${part.length.toString(16)}\r\n`),
                );
              await writeBytes(part);
              if (chunked) await writeBytes(new Uint8Array([13, 10]));
            } catch (error) {
              if (!parser.complete) throw error;
              return;
            }
          }
        },
        async end() {
          await ready;
          if (parser.complete || ended) return;
          ended = true;
          if (length !== undefined && sent !== length)
            throw new TypeError("Request does not match Content-Length");
          try {
            if (chunked)
              await writeBytes(new TextEncoder().encode("0\r\n\r\n"));
          } catch (error) {
            if (!parser.complete) throw error;
          }
          // HTTP framing ends the request; do not half-close TLS before response.
        },
        async read() {
          await headers;
          while (!parser.chunks.length && !parser.complete) await pull();
          return parser.chunks.shift() ?? null;
        },
        close,
      };
    },
  };
}
export const nativeNetwork: NativeNetwork = {
  open(request) {
    return createNativeNetwork().open(request);
  },
};
