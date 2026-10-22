import tty, * as namespace from "node:tty";
import { Socket } from "node:net";
import {
  defineFeature,
  FeatureImplementation,
} from "cf-workers-native/shared/contracts";
import type { ContractSuite } from "cf-workers-native/shared/contracts/testing";
const groups = [
  "exports",
  "isatty",
  "readStream",
  "writeStream",
  "callbacks",
] as const;
export const ttyFeature = defineFeature<typeof tty>()("node.tty", groups);
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
export const ttyContract: ContractSuite<typeof ttyFeature> = {
  feature: ttyFeature,
  cases: {
    exports(api) {
      equal(Object.keys(api).sort(), ["ReadStream", "WriteStream", "isatty"]);
      equal(Object.keys(namespace).sort(), [
        "ReadStream",
        "WriteStream",
        "default",
        "isatty",
      ]);
      for (const name of ["ReadStream", "WriteStream", "isatty"] as const)
        equal(api[name] === namespace[name], true);
      equal(Object.getOwnPropertyNames(api.ReadStream.prototype).sort(), [
        "constructor",
        "setRawMode",
      ]);
      equal(
        Object.getOwnPropertyNames(api.WriteStream.prototype).sort(),
        [
          "constructor",
          "isTTY",
          "getColorDepth",
          "hasColors",
          "_refreshSize",
          "cursorTo",
          "moveCursor",
          "clearLine",
          "clearScreenDown",
          "getWindowSize",
        ].sort(),
      );
      for (const ctor of [api.ReadStream, api.WriteStream]) {
        equal(Object.getPrototypeOf(ctor) === Socket, true);
        equal(Object.getPrototypeOf(ctor.prototype) === Socket.prototype, true);
      }
    },
    isatty(api) {
      for (const value of [
        undefined,
        null,
        0,
        1,
        2,
        -1,
        NaN,
        Infinity,
        {},
        "1",
        Symbol("fd"),
      ])
        equal(api.isatty(value as number), false);
    },
    readStream(api) {
      for (const fd of [0, 1, -1, undefined, null, "fd", {}]) {
        const stream = new api.ReadStream(fd as number);
        equal((stream as unknown as { fd: unknown }).fd, fd);
        equal(stream.isTTY, false);
        equal(stream.isRaw, false);
        equal(stream instanceof Socket, true);
        equal(stream.setRawMode(true) === stream, true);
        equal(stream.isRaw, true);
        stream.setRawMode(false);
        equal(stream.isRaw, false);
      }
      const target = {} as tty.ReadStream;
      equal(Reflect.apply(api.ReadStream, target, [7]) === target, true);
      equal(target.isRaw, false);
      let touched = false;
      new api.ReadStream(0, {
        get readable(): never {
          touched = true;
          throw new Error("unused options");
        },
      });
      equal(touched, false);
    },
    writeStream(api) {
      const stream = new api.WriteStream(1);
      equal(stream instanceof Socket, true);
      equal(stream.isTTY, true);
      equal(stream.columns, 0);
      equal(stream.rows, 0);
      equal(stream.getColorDepth(), 8);
      equal(stream.hasColors(), false);
      equal(stream.hasColors(256), false);
      equal(stream.getWindowSize(), [0, 0]);
      stream.columns = 80;
      stream.rows = 24;
      equal(stream.getWindowSize(), [80, 24]);
      const size = stream.getWindowSize();
      size[0] = 1;
      equal(stream.getWindowSize(), [80, 24]);
      equal(
        (stream as unknown as { _refreshSize(): void })._refreshSize(),
        undefined,
      );
      const target = {} as tty.WriteStream;
      equal(Reflect.apply(api.WriteStream, target, [9]) === target, true);
      equal(target.columns, 0);
    },
    callbacks(api) {
      const stream = new api.WriteStream(1);
      const calls: string[] = [];
      equal(
        stream.cursorTo(1, () => calls.push("cursor")),
        false,
      );
      equal(
        stream.cursorTo(1, 2, () => calls.push("cursor2")),
        false,
      );
      equal(
        stream.moveCursor(1, 2, () => calls.push("move")),
        false,
      );
      equal(
        stream.clearLine(0, () => calls.push("line")),
        false,
      );
      equal(
        stream.clearScreenDown(() => calls.push("screen")),
        false,
      );
      equal(calls, ["cursor", "cursor2", "move", "line", "screen"]);
      const sentinel = {};
      try {
        stream.clearLine(0, () => {
          throw sentinel;
        });
      } catch (error) {
        if (error !== sentinel) throw error;
        return;
      }
      throw new Error("Callback did not throw");
    },
  },
};
export class TtyImplementation extends FeatureImplementation<
  typeof ttyFeature
> {
  constructor() {
    super(ttyFeature, {
      exports: { status: "supported" },
      isatty: { status: "supported" },
      readStream: { status: "supported" },
      writeStream: { status: "supported" },
      callbacks: { status: "supported" },
    });
  }
  create() {
    return tty;
  }
}
