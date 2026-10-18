import { describe, it, expect } from "vitest";
import { ReadableStream as PonyReadable } from "web-streams-polyfill";
import { AsyncLocalStorage } from "../async-hooks/index.js";
import { contextConstructor } from "./context.js";

describe.each([globalThis.ReadableStream, PonyReadable])(
  "stream source context",
  (Constructor) => {
    it("keeps the source receiver and creation context after the synchronous scope exits", async () => {
      const Wrapped = contextConstructor(
        Constructor as unknown as typeof globalThis.ReadableStream,
        ["start", "pull", "cancel"],
      );
      const storage = new AsyncLocalStorage<string>();
      let reads = 0;
      const seen: unknown[] = [];
      const source = {
        get pull() {
          reads++;
          return function (this: unknown, controller: any) {
            seen.push(this, storage.getStore());
            controller.close();
          };
        },
      };
      const stream = storage.run(
        "creation",
        () => new Wrapped(source, { highWaterMark: 0 }),
      );
      expect(storage.getStore()).toBeUndefined();
      expect(reads).toBe(1);
      const reader = stream.getReader();
      await reader.read();
      reader.releaseLock();
      expect(seen).toEqual([source, "creation"]);
      expect(storage.getStore()).toBeUndefined();
      expect(globalThis.ReadableStream).not.toBe(Wrapped);
    });
  },
);
