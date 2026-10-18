import { isResponse } from "../compat/fetch/interop.js";
import { Request as WorkerRequest } from "../compat/request/index.js";
import type { WorkerHandler } from "../fetch/types.js";
import type { Command, Invocation, Reply } from "./protocol.js";

export function serve(worker: WorkerHandler<unknown>) {
  // Buffered upload, pull-driven response chunks: no transferable streams required.
  self.onmessage = async ({ data }: MessageEvent<Invocation>) => {
    const { port, url, method, headers, body, env } = data;
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let bodyDone = false;
    let cancelling = false;
    let backgroundDone = false;
    const send = (reply: Reply) => port.postMessage(reply);
    const close = () => {
      if (bodyDone && backgroundDone) port.close();
    };
    const end = () => {
      if (!bodyDone) {
        bodyDone = true;
        send({ type: "end" });
      }
      close();
    };
    const error = (cause: unknown) => {
      bodyDone = true;
      send({
        type: "error",
        name: cause instanceof Error ? cause.name : "Error",
        message: String(cause),
      });
      close();
    };
    port.onmessage = async ({ data }: MessageEvent<Command>) => {
      try {
        if (data === "abort") {
          controller.abort();
          if (reader) {
            cancelling = true;
            await reader.cancel();
            end();
          }
        } else if (data === "cancel") {
          cancelling = true;
          await reader?.cancel();
          end();
        } else if (data === "pull" && reader && !bodyDone) {
          const chunk = await reader.read();
          if (cancelling) return;
          if (chunk.done) end();
          else if (!bodyDone) send({ type: "chunk", value: chunk.value });
        }
      } catch (cause) {
        error(cause);
      }
    };
    const pending: Promise<unknown>[] = [];
    const errors: string[] = [];
    try {
      const request = new WorkerRequest(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      const response = await worker.fetch(request as unknown as Request, env, {
        props: {},
        passThroughOnException() {
          throw new Error(
            "passThroughOnException is unsupported for local execution.",
          );
        },
        waitUntil(promise) {
          pending.push(
            promise.catch((cause) => {
              errors.push(String(cause));
            }),
          );
        },
      });
      if (!isResponse(response) || response.status === 0)
        throw new TypeError("worker.fetch must return a non-error Response.");
      if (response.bodyUsed || response.body?.locked)
        throw new TypeError("worker.fetch returned an unusable response body.");
      reader = response.body?.getReader();
      bodyDone = !reader;
      send({
        type: "response",
        status: response.status,
        statusText: response.statusText,
        headers: [...response.headers],
        hasBody: !!reader,
      });
    } catch (cause) {
      error(cause);
    } finally {
      while (pending.length) await Promise.all(pending.splice(0));
      send({ type: "done", errors });
      backgroundDone = true;
      close();
    }
  };
  self.postMessage({ type: "ready" });
}
