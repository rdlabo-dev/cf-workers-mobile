import { createNetworkRelay } from "../compat/fetch/relay.js";
import type { WorkerHandler } from "../fetch/types.js";
import type { Command, Reply } from "./protocol.js";

/** Internal Dedicated Worker transport. */
export function createIsolatedWorker<Env>(worker: Worker) {
  const network = createNetworkRelay(worker);
  const calls = new Set<(error: Error) => void>();
  let failure: Error | undefined;
  let started!: () => void;
  let startupFailed!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    started = resolve;
    startupFailed = reject;
  });
  // A startup failure may precede the first fetch/observer.
  void ready.catch(() => {});
  const stop = (error: Error) => {
    failure ??= error;
    startupFailed(failure);
    for (const fail of calls) fail(failure);
    worker.terminate();
    return network.dispose();
  };
  worker.onmessage = (event) => {
    network.receive(event);
    const { data } = event;
    if (data.type === "ready") started();
  };
  worker.onerror = (event) => {
    event.preventDefault();
    void stop(new Error(event.message || "Worker startup failed"))?.catch(
      console.error,
    );
  };
  worker.onmessageerror = () =>
    void stop(new Error("Worker message could not be decoded"))?.catch(
      console.error,
    );

  const handler: WorkerHandler<Env> = {
    async fetch(request, env, ctx) {
      if (failure) throw failure;
      request.signal.throwIfAborted();
      return new Promise<Response>((resolve, reject) => {
        const { port1, port2 } = new MessageChannel();
        let backgroundDone = false;
        let bodyDone = false;
        let released = false;
        let dispatched = false;
        let upload: ReadableStreamDefaultReader<Uint8Array> | undefined;
        let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
        let pulled: (() => void) | undefined;
        let cancelled:
          | { resolve(): void; reject(error: unknown): void }
          | undefined;
        let done!: () => void;
        ctx.waitUntil(
          new Promise<void>((resolve) => {
            done = resolve;
          }),
        );
        const send = (command: Command) => port1.postMessage(command);
        const release = () => {
          if (released || !bodyDone || !backgroundDone) return;
          released = true;
          request.signal.removeEventListener("abort", abort);
          port1.close();
          if (!dispatched) port2.close();
          calls.delete(fail);
        };
        const finishBody = (...failure: [] | [unknown]) => {
          const [error] = failure;
          if (!bodyDone) {
            bodyDone = true;
            if (failure.length) stream?.error(error);
            else stream?.close();
          }
          pulled?.();
          pulled = undefined;
          if (failure.length) cancelled?.reject(error);
          else cancelled?.resolve();
          cancelled = undefined;
          release();
        };
        const fail = (error: unknown) => {
          if (released) return;
          void upload?.cancel(error).catch(() => {});
          reject(error);
          backgroundDone = true;
          done();
          finishBody(error);
        };
        const abort = () => {
          if (!dispatched) {
            fail(request.signal.reason);
            return;
          }
          send("abort");
          reject(request.signal.reason);
          finishBody(request.signal.reason);
        };
        calls.add(fail);
        request.signal.addEventListener("abort", abort, { once: true });
        port1.onmessageerror = () =>
          fail(new Error("Response message could not be decoded"));
        port1.onmessage = ({ data }: MessageEvent<Reply>) => {
          if (released) return;
          if (data.type === "response") {
            if (request.signal.aborted) {
              send("cancel");
              return;
            }
            const responseBody = data.hasBody
              ? new ReadableStream<Uint8Array>(
                  {
                    start(controller) {
                      stream = controller;
                    },
                    pull() {
                      return new Promise<void>((resolve) => {
                        pulled = resolve;
                        send("pull");
                      });
                    },
                    cancel() {
                      stream = undefined;
                      pulled?.();
                      pulled = undefined;
                      return new Promise<void>((resolve, reject) => {
                        cancelled = { resolve, reject };
                        send("cancel");
                      });
                    },
                  },
                  { highWaterMark: 0 },
                )
              : null;
            bodyDone = !data.hasBody;
            try {
              resolve(
                new Response(responseBody, {
                  status: data.status,
                  statusText: data.statusText,
                  headers: data.headers,
                }),
              );
            } catch (error) {
              send("cancel");
              fail(error as Error);
            }
          } else if (data.type === "chunk") {
            if (!bodyDone) stream?.enqueue(data.value);
            pulled?.();
            pulled = undefined;
          } else if (data.type === "end") {
            finishBody();
          } else if (data.type === "error") {
            const error = new Error(data.message);
            error.name = data.name;
            reject(error);
            finishBody(error);
          } else {
            for (const error of data.errors)
              ctx.waitUntil(Promise.reject(new Error(error)));
            backgroundDone = true;
            done();
          }
          release();
        };
        void (async () => {
          await ready;
          if (released) return;
          let body: ArrayBuffer | null = null;
          if (request.body) {
            upload = request.body.getReader();
            try {
              const chunks: Uint8Array[] = [];
              let length = 0;
              while (true) {
                const chunk = await upload.read();
                if (released) return;
                if (chunk.done) break;
                if (!(chunk.value instanceof Uint8Array))
                  throw new TypeError(
                    "Request body must contain Uint8Array chunks.",
                  );
                chunks.push(chunk.value);
                length += chunk.value.byteLength;
              }
              const bytes = new Uint8Array(length);
              let offset = 0;
              for (const chunk of chunks) {
                bytes.set(chunk, offset);
                offset += chunk.byteLength;
              }
              body = bytes.buffer;
            } finally {
              upload.releaseLock();
              upload = undefined;
            }
          }
          if (released) return;
          worker.postMessage(
            {
              port: port2,
              url: request.url,
              method: request.method,
              headers: [...request.headers],
              body,
              env,
            },
            body ? [port2, body] : [port2],
          );
          dispatched = true;
        })().catch(fail);
      });
    },
  };
  return {
    handler,
    ready,
    get activeCalls() {
      return calls.size;
    },
    dispose() {
      return stop(new Error("Worker runtime disposed"));
    },
  };
}
