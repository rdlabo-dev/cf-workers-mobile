import { observeConsumption } from "./reader.js";
import { getNativeCall } from "../fetch/native-network.js";

export interface SocketInfo {
  localAddress?: string | null;
  remoteAddress?: string | null;
}
export interface PlatformSocket {
  upgraded?: boolean;
  opened: Promise<SocketInfo>;
  closed: Promise<void>;
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close(): Promise<void>;
}
function bytes(value: string) {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}
function encoded(value: Uint8Array) {
  let result = "";
  for (let offset = 0; offset < value.length; offset += 8192)
    result += String.fromCharCode(...value.subarray(offset, offset + 8192));
  return btoa(result);
}
export function connect(
  address: string,
  options: {
    allowHalfOpen?: boolean;
    secureTransport?: "on" | "off" | "starttls";
  } = {},
): PlatformSocket {
  const call = getNativeCall();
  if (!call)
    throw new Error("TCP sockets require the Capacitor native transport");
  const separator = address.lastIndexOf(":");
  const hostname = address.slice(0, separator).replace(/^\[|\]$/g, "");
  const portText = address.slice(separator + 1);
  if (separator < 1 || !/^\d+$/.test(portText))
    throw new TypeError("Invalid TCP address");
  const url = new URL(
    `tcp://${hostname.includes(":") ? `[${hostname}]` : hostname}:${portText}`,
  );
  const port = Number(url.port);
  if (
    !url.hostname ||
    !port ||
    url.username ||
    url.password ||
    (url.pathname && url.pathname !== "/")
  )
    throw new TypeError("Invalid TCP address");
  const id = crypto.randomUUID();
  let readableController!: ReadableStreamDefaultController<Uint8Array>;
  let writableController!: WritableStreamDefaultController;
  let readEnded = false,
    writeEnded = false,
    stopped = false;
  let resolveClosed!: () => void, rejectClosed!: (error: unknown) => void;
  const closed = new Promise<void>((resolve, reject) => {
    resolveClosed = resolve;
    rejectClosed = reject;
  });
  void closed.catch(() => {});
  let terminal = false,
    readPending = false,
    pendingBytes = 0;
  const notifyTerminal = () => {
    if (!terminal || stopped || readPending || pendingBytes !== 0) return;
    if (!readEnded) {
      readEnded = true;
      readableController.close();
    }
    resolveClosed();
  };
  let closing: Promise<void> | undefined;
  const close = () => {
    if (!closing) {
      stopped = true;
      closing = call("CapacitorWorkers", "socketClose", { id }).then(
        () => {
          if (!readEnded) {
            readEnded = true;
            readableController.error(new Error("Socket closed"));
          }
          if (!writeEnded) {
            writeEnded = true;
            writableController.error(new Error("Socket closed"));
          }
          resolveClosed();
        },
        (error) => {
          rejectClosed(error);
          throw error;
        },
      );
    }
    return closing;
  };
  const fail = (error: unknown) => {
    if (!stopped) {
      readableController.error(error);
      writableController.error(error);
      rejectClosed(error);
      void close().catch(() => {});
    }
  };
  const finish = async () => {
    if (readEnded && writeEnded) await close();
  };
  const opened = Promise.resolve()
    .then(() => {
      if (stopped) throw new Error("Socket closed before connection");
      return call("CapacitorWorkers", "socketOpen", {
        id,
        host: url.hostname.replace(/^\[|\]$/g, ""),
        port,
        tls: options.secureTransport === "on",
      });
    })
    .then(async (value) => {
      if (stopped) {
        await call("CapacitorWorkers", "socketClose", { id });
        throw new Error("Socket closed before connection");
      }
      return value as SocketInfo;
    });
  void opened
    .then(async () => {
      if (stopped) return;
      await call("CapacitorWorkers", "socketWatch", { id });
      terminal = true;
      notifyTerminal();
    })
    .catch(fail);
  const readable = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        readableController =
          controller as ReadableStreamDefaultController<Uint8Array>;
      },
      async pull(genericController) {
        const controller =
          genericController as ReadableStreamDefaultController<Uint8Array>;
        try {
          await opened;
          readPending = true;
          const result = (await call("CapacitorWorkers", "socketRead", {
            id,
            maxBytes: 65536,
          })) as { chunk?: string; eof?: boolean };
          if (stopped) return;
          if (result.eof) {
            if (!readEnded) {
              readEnded = true;
              controller.close();
            }
            await finish();
          } else if (typeof result.chunk === "string") {
            const chunk = bytes(result.chunk);
            pendingBytes += chunk.byteLength;
            controller.enqueue(chunk);
          } else throw new Error("Invalid native socket read result");
        } catch (error) {
          fail(error);
        } finally {
          readPending = false;
          notifyTerminal();
        }
      },
      cancel() {
        readEnded = true;
        return close();
      },
    },
    { highWaterMark: 0 },
  );
  const writable = new WritableStream<Uint8Array>({
    start(controller) {
      writableController = controller;
    },
    async write(chunk) {
      try {
        await opened;
        for (let offset = 0; offset < chunk.byteLength; offset += 65536)
          await call("CapacitorWorkers", "socketWrite", {
            id,
            chunk: encoded(chunk.subarray(offset, offset + 65536)),
          });
      } catch (error) {
        fail(error);
        throw error;
      }
    },
    async close() {
      try {
        await opened;
        await call("CapacitorWorkers", "socketEnd", { id });
        writeEnded = true;
        await finish();
      } catch (error) {
        fail(error);
        throw error;
      }
    },
    abort() {
      writeEnded = true;
      return close();
    },
  });
  observeConsumption(readable, (count) => {
    pendingBytes -= count;
    notifyTerminal();
  });
  return { opened, closed, readable, writable, close };
}
export default { connect };
