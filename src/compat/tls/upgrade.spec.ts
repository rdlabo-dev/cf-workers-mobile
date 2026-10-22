import { afterEach, expect, it, vi } from "vitest";
import { connect as tcp, Socket } from "../net/index.js";
import { connect, TLSSocket } from "./index.js";
import {
  setNativeCall,
  type NativeCall,
} from "../../browser/fetch/native-network.js";
let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});
it("rejects TLS wrapping before application bytes can reach a plain socket", async () => {
  const call = vi.fn<NativeCall>(async (_, method) =>
    method === "socketRead" || method === "socketWatch"
      ? new Promise(() => {})
      : {},
  );
  restore = setNativeCall(call);
  const plain = tcp({ host: "localhost", port: 1234 });
  plain.on("error", () => {});
  try {
    await new Promise<void>((resolve, reject) => {
      plain.once("connect", resolve);
      plain.once("error", reject);
    });
    expect(() =>
      connect({ socket: plain, servername: "localhost" }).write("secret-data"),
    ).toThrow(/TLS upgrade of an existing socket/);
    expect(() => new TLSSocket(plain, { port: 1234 })).toThrow(
      expect.objectContaining({ code: "ERR_METHOD_NOT_IMPLEMENTED" }),
    );
    expect(
      call.mock.calls.filter(([, method]) => method === "socketOpen"),
    ).toHaveLength(1);
    expect(call.mock.calls.some(([, method]) => method === "socketWrite")).toBe(
      false,
    );
    expect(plain.destroyed).toBe(false);
  } finally {
    plain.destroy();
  }
});
it("rejects wrapping an unconnected socket before acquiring its handles", () => {
  const socket = new Socket();
  try {
    expect(() => connect({ socket })).toThrow(
      /TLS upgrade of an existing socket/,
    );
    expect(socket.listenerCount("connect")).toBe(0);
    expect(socket.destroyed).toBe(false);
  } finally {
    socket.destroy();
  }
});
