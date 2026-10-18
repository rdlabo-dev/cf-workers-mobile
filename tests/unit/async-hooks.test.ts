import {
  AsyncLocalStorage,
  AsyncResource,
} from "../../src/compat/async-hooks/index";
import { expect, it } from "vitest";
import { runContract } from "@rdlabo/workers-capacitor/testing";
import {
  AsyncHooksImplementation,
  asyncHooksContract,
} from "../../src/compat/async-hooks/index.spec";

it("async-hooks contract", async () => {
  const report = await runContract(
    new AsyncHooksImplementation({ AsyncLocalStorage, AsyncResource }),
    asyncHooksContract,
  );
  expect(report.cases.filter((c) => c.status === "failed")).toEqual([]);
});

it("keeps stream source and sink receivers intact", async () => {
  const source = {
    value: 42,
    start(controller: ReadableStreamDefaultController<number>) {
      controller.enqueue(this.value);
      controller.close();
    },
  };
  expect((await new ReadableStream(source).getReader().read()).value).toBe(42);
  const sink = {
    values: [] as number[],
    write(value: number) {
      this.values.push(value);
    },
  };
  const writer = new WritableStream(sink).getWriter();
  await writer.write(7);
  await writer.close();
  expect(sink.values).toEqual([7]);
});

it("delivers one message context to all listeners and supports removal and null handlers", async () => {
  const { AsyncLocalStorage } =
    await import("../../src/compat/async-hooks/index");
  const als = new AsyncLocalStorage<string>();
  const { port1, port2 } = new MessageChannel();
  const seen: unknown[] = [];
  const removed = () => seen.push("removed");
  port1.addEventListener("message", removed);
  port1.removeEventListener("message", removed);
  port1.onmessage = () => seen.push("stale");
  port1.onmessage = null;
  try {
    const done = new Promise<void>((resolve) => {
      port1.addEventListener("message", function () {
        seen.push([als.getStore(), this === port1]);
      });
      port1.addEventListener("message", {
        handleEvent() {
          seen.push(als.getStore());
          resolve();
        },
      });
    });
    port1.start();
    als.run("sender", () => port2.postMessage("hello"));
    await done;
    expect(seen).toEqual([["sender", true], "sender"]);
    expect(als.getStore()).toBeUndefined();
  } finally {
    port1.close();
    port2.close();
  }
});

it("rejects native async callbacks before running them", async () => {
  const { AsyncLocalStorage } =
    await import("../../src/compat/async-hooks/index");
  const als = new AsyncLocalStorage<string>();
  const callback = new Function(
    "return async function () { throw new Error('must not run'); }",
  )();
  expect(() => als.run("request", callback)).toThrow("async/await lowering");
  expect(als.getStore()).toBeUndefined();
});
