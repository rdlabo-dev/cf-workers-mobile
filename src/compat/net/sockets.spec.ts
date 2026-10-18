import { afterEach, expect, it, vi } from "vitest";
import { connect } from "./sockets.js";
import { setNativeCall, type NativeCall } from "../fetch/native-network.js";
let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});
it("never opens a socket cancelled in the same turn", async () => {
  const call = vi.fn<NativeCall>(async (_, method) =>
    method === "socketWatch" ? new Promise(() => {}) : {},
  );
  restore = setNativeCall(call);
  const socket = connect("localhost:1234");
  const opening = expect(socket.opened).rejects.toThrow("closed");
  await socket.close();
  await opening;
  await socket.closed;
  expect(call.mock.calls.map((args) => args[1])).toEqual(["socketClose"]);
});
it("closes a connection that finishes opening after cancellation", async () => {
  let finish!: (value: unknown) => void;
  const call = vi.fn<NativeCall>(async (_, method) => {
    if (method === "socketOpen")
      return new Promise((resolve) => {
        finish = resolve;
      });
    if (method === "socketWatch") return new Promise(() => {});
    return {};
  });
  restore = setNativeCall(call);
  const socket = connect("localhost:1234");
  const opening = expect(socket.opened).rejects.toThrow("closed");
  await Promise.resolve();
  await socket.close();
  finish({});
  await opening;
  expect(call.mock.calls.map((args) => args[1])).toEqual([
    "socketOpen",
    "socketClose",
    "socketClose",
  ]);
});
it("bounds writes and keeps the read half alive after end", async () => {
  const call = vi.fn<NativeCall>(async (_, method) =>
    method === "socketRead"
      ? { eof: true }
      : method === "socketWatch"
        ? new Promise(() => {})
        : {},
  );
  restore = setNativeCall(call);
  const socket = connect("localhost:1234");
  await socket.opened;
  const writer = socket.writable.getWriter();
  await writer.write(new Uint8Array(65537));
  await writer.close();
  expect(
    call.mock.calls
      .filter((args) => args[1] === "socketWrite")
      .map((args) => atob(String(args[2].chunk)).length),
  ).toEqual([65536, 1]);
  expect(call.mock.calls.some((args) => args[1] === "socketClose")).toBe(false);
  const reader = socket.readable.getReader();
  expect((await reader.read()).done).toBe(true);
  await socket.closed;
  expect(call.mock.calls.at(-1)?.[1]).toBe("socketClose");
});

it("normalizes bracketed and unbracketed IPv6 authorities", async () => {
  const call = vi.fn<NativeCall>(async (_, method) =>
    method === "socketWatch" ? new Promise(() => {}) : {},
  );
  restore = setNativeCall(call);
  for (const address of ["[::1]:1234", "::1:1234"]) {
    const socket = connect(address);
    await socket.opened;
    await socket.close();
  }
  expect(
    call.mock.calls
      .filter((args) => args[1] === "socketOpen")
      .map((args) => args[2].host),
  ).toEqual(["::1", "::1"]);
});

it("keeps reads bounded and copies into caller buffers without requiring BYOB", async () => {
  const { socketReader } = await import("./reader.js");
  const reader = socketReader(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3, 4, 5]));
        controller.close();
      },
    }),
  );
  const storage = new Uint8Array(4);
  let view = storage.subarray(1, 3);
  for (const expected of [[1, 2], [3, 4], [5]]) {
    const result = await reader.read(view);
    expect(view.byteLength).toBe(0);
    expect(result.value).toEqual(new Uint8Array(expected));
    expect(new Uint8Array(result.value!.buffer)[0]).toBe(0);
    expect(new Uint8Array(result.value!.buffer)[3]).toBe(0);
    view = new Uint8Array(result.value!.buffer, 1, 2);
  }
  expect((await reader.read(view)).done).toBe(true);
});

it("does not announce native EOF until the reader consumes buffered bytes", async () => {
  const { socketReader } = await import("./reader.js");
  let ended!: (value: unknown) => void;
  const call = vi.fn<NativeCall>(async (_, method) => {
    if (method === "socketWatch")
      return new Promise((resolve) => {
        ended = resolve;
      });
    if (method === "socketRead") return { chunk: btoa("abcde") };
    return {};
  });
  restore = setNativeCall(call);
  const socket = connect("localhost:1234");
  await socket.opened;
  const reader = socketReader(socket.readable);
  let closed = false;
  void socket.closed.then(() => {
    closed = true;
  });
  expect(
    new TextDecoder().decode((await reader.read(new Uint8Array(2))).value),
  ).toBe("ab");
  ended({});
  await Promise.resolve();
  await Promise.resolve();
  expect(closed).toBe(false);
  expect(
    new TextDecoder().decode((await reader.read(new Uint8Array(3))).value),
  ).toBe("cde");
  await socket.closed;
  expect((await reader.read(new Uint8Array(1))).done).toBe(true);
  await socket.writable.getWriter().close();
  expect(
    call.mock.calls.filter((args) => args[1] === "socketRead"),
  ).toHaveLength(1);
});
