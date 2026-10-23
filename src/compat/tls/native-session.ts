import { NativeTLS } from "../crypto/native-crypto.js";
import type { NativeCall } from "../../browser/fetch/native-network.js";

function decode(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
function encode(value: Uint8Array) {
  let text = "";
  for (let i = 0; i < value.length; i += 8192)
    text += String.fromCharCode(...value.subarray(i, i + 8192));
  return btoa(text);
}
/** Memory-BIO encryption on the original TCP stream, with mandatory OS trust. */
export async function nativeTlsSession(
  call: NativeCall,
  id: string,
  hostname: string,
): Promise<NativeCall> {
  const tls = new NativeTLS(hostname);
  let stopped = false,
    eof = false,
    pumping = false;
  let buffered: Uint8Array | undefined;
  let incoming: Promise<void> | undefined;
  let outgoing = Promise.resolve();
  let reading:
    | {
        count: number;
        resolve: (value: unknown) => void;
        reject: (error: unknown) => void;
      }
    | undefined;
  let resolveWatch!: (value: unknown) => void,
    rejectWatch!: (error: unknown) => void;
  const watched = new Promise((resolve, reject) => {
    resolveWatch = resolve;
    rejectWatch = reject;
  });
  void watched.catch(() => {});
  const stop = (error?: unknown) => {
    if (stopped) return;
    stopped = true;
    tls.dispose();
    buffered = undefined;
    reading?.reject(error ?? new Error("TLS session closed"));
    reading = undefined;
    if (error) rejectWatch(error);
    else resolveWatch({});
  };
  const flush = () => {
    for (const data of tls.drain()) {
      outgoing = outgoing.then(async () => {
        if (stopped) throw new Error("TLS session closed");
        await call("WorkersCapacitor", "socketWrite", {
          id,
          chunk: encode(data),
        });
      });
    }
    return outgoing;
  };
  const receive = (): Promise<void> =>
    (incoming ??= (async () => {
      const value = (await call("WorkersCapacitor", "socketRead", {
        id,
        maxBytes: 65536,
      })) as { chunk?: string; eof?: boolean };
      if (stopped) throw new Error("TLS session closed");
      if (value.eof)
        throw new Error("TLS connection closed without close_notify");
      if (typeof value.chunk !== "string")
        throw new Error("Invalid TLS transport response");
      tls.feed(decode(value.chunk));
    })().finally(() => {
      incoming = undefined;
    }));
  const retry = async (status: number) => {
    await flush();
    if (status === -2) await receive();
    else if (status !== -3) throw new Error(`TLS operation failed (${status})`);
  };
  const deliver = () => {
    if (buffered && reading) {
      const pending = reading;
      reading = undefined;
      const data = buffered.subarray(0, pending.count);
      buffered =
        buffered.byteLength > data.byteLength
          ? buffered.subarray(data.byteLength)
          : undefined;
      pending.resolve({ chunk: encode(data) });
    }
    if (eof && !buffered) {
      reading?.resolve({ eof: true });
      reading = undefined;
      resolveWatch({});
    }
  };
  const pump = async () => {
    if (pumping || stopped) return;
    pumping = true;
    try {
      while (!stopped && !eof && !buffered) {
        const result = tls.read();
        if (result instanceof Uint8Array) {
          buffered = result;
          deliver();
        } else if (result === -6) {
          eof = true;
          deliver();
        } else await retry(result);
      }
    } catch (error) {
      stop(error);
    } finally {
      pumping = false;
    }
  };
  try {
    for (;;) {
      const status = tls.handshake();
      if (status === 1) break;
      await retry(status);
    }
    await flush();
    const certificates = tls.certificates();
    if (!certificates.length)
      throw new Error("TLS peer did not present a certificate");
    // No application reads/writes or successful open are exposed before this.
    await call("WorkersCapacitor", "socketVerifyTls", {
      id,
      servername: hostname,
      certificates: certificates.map(encode),
    });
  } catch (error) {
    stop(error);
    throw error;
  }
  void pump();
  return async (plugin, method, args) => {
    if (method === "socketClose") {
      stop();
      return call(plugin, method, args);
    }
    if (method === "socketWatch") return watched;
    if (stopped) throw new Error("TLS session closed");
    if (method === "socketRead") {
      if (reading) throw new Error("TLS read already pending");
      return new Promise((resolve, reject) => {
        reading = { count: Number(args.maxBytes ?? 65536), resolve, reject };
        deliver();
        void pump();
      });
    }
    try {
      if (method === "socketWrite") {
        const data = decode(String(args.chunk));
        for (let offset = 0; offset < data.length; ) {
          const status = tls.write(data.subarray(offset));
          if (status > 0) offset += status;
          else await retry(status);
        }
        await flush();
        return {};
      }
      if (method === "socketEnd") {
        for (;;) {
          const status = tls.shutdown();
          if (status >= 0) break;
          await retry(status);
        }
        await flush();
        return {};
      }
      return await call(plugin, method, args);
    } catch (error) {
      stop(error);
      throw error;
    }
  };
}
