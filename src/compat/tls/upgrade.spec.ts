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
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
function bridge() {
  let resolve!: (value: unknown) => void, reject!: (error: Error) => void;
  const handshake = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const call = vi.fn<NativeCall>(async (_, method) => {
    if (method === "socketStartTls") return handshake;
    if (method === "socketRead" || method === "socketWatch")
      return new Promise(() => {});
    return {};
  });
  restore = setNativeCall(call);
  return { call, resolve, reject };
}
it("holds immediate application writes until the existing connection authenticates", async () => {
  const { call, resolve } = bridge();
  const plain = tcp({ host: "localhost", port: 1234 });
  plain.on("error", () => {});
  await new Promise<void>((yes) => plain.once("connect", yes));
  const tls = connect({ socket: plain, servername: "localhost" });
  tls.on("error", () => {});
  tls.write("secret");
  await tick();
  expect(
    call.mock.calls.filter(([, m]) => m === "socketStartTls"),
  ).toHaveLength(1);
  expect(call.mock.calls.some(([, m]) => m === "socketWrite")).toBe(false);
  resolve({});
  await tick();
  expect(tls.authorized).toBe(true);
  expect(call.mock.calls.filter(([, m]) => m === "socketOpen")).toHaveLength(1);
  expect(call.mock.calls.filter(([, m]) => m === "socketWrite")).toHaveLength(
    1,
  );
  tls.destroy();
  plain.destroy();
});
it("never transmits queued application bytes when certificate verification fails", async () => {
  const { call, reject } = bridge();
  const plain = tcp({ host: "localhost", port: 1234 });
  plain.on("error", () => {});
  await new Promise<void>((yes) => plain.once("connect", yes));
  const tls = connect({ socket: plain, servername: "wrong.invalid" });
  const error = new Promise((yes) => tls.once("error", yes));
  tls.write("secret");
  await tick();
  reject(new Error("certificate mismatch"));
  await error;
  await tick();
  expect(call.mock.calls.some(([, m]) => m === "socketWrite")).toBe(false);
  expect(call.mock.calls.some(([, m]) => m === "socketClose")).toBe(true);
  plain.destroy();
});
it("upgrades a parent connected after TLS wrapping without opening another connection", async () => {
  const { call, resolve } = bridge();
  const plain = new Socket();
  plain.on("error", () => {});
  const tls = connect({ socket: plain, servername: "localhost" });
  tls.on("error", () => {});
  tls.write("secret");
  await tick();
  expect(call.mock.calls).toHaveLength(0);
  plain.connect({ host: "localhost", port: 1234 });
  await tick();
  expect(
    call.mock.calls.filter(([, m]) => m === "socketStartTls"),
  ).toHaveLength(1);
  resolve({});
  await tick();
  expect(call.mock.calls.filter(([, m]) => m === "socketWrite")).toHaveLength(
    1,
  );
  tls.destroy();
  plain.destroy();
});

it("closes the connection when destroyed during authentication", async () => {
  const { call, resolve } = bridge();
  const plain = tcp({ host: "localhost", port: 1234 });
  plain.on("error", () => {});
  await new Promise<void>((yes) => plain.once("connect", yes));
  const tls = connect({ socket: plain, servername: "localhost" });
  tls.on("error", () => {});
  tls.write("secret");
  await tick();
  expect(() => new TLSSocket(plain, { port: 1234 })).toThrow(
    /unavailable socket/,
  );
  tls.destroy();
  await tick();
  resolve({});
  await tick();
  expect(call.mock.calls.some(([, m]) => m === "socketClose")).toBe(true);
  expect(call.mock.calls.some(([, m]) => m === "socketWrite")).toBe(false);
  plain.destroy();
});
