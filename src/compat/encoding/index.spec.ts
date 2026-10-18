import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";
import * as api from "./index.js";
const equal = (value: unknown, expected: unknown) => {
  if (JSON.stringify(value) !== JSON.stringify(expected))
    throw new Error(`${JSON.stringify(value)} != ${JSON.stringify(expected)}`);
};
function rejects(fn: () => unknown, name: string) {
  try {
    fn();
  } catch (error) {
    equal((error as Error).name, name);
    return;
  }
  throw new Error(`Expected ${name}`);
}
export const encodingFeature = defineFeature<typeof api>()("web.encoding", [
  "encoder",
  "encodeInto",
  "labels",
  "decoderOptions",
  "streaming",
  "inputViews",
]);
export const encodingContract: ContractSuite<typeof encodingFeature> = {
  feature: encodingFeature,
  cases: {
    encoder({ TextEncoder }) {
      const encoder = new TextEncoder();
      equal(encoder.encoding, "utf-8");
      equal([...encoder.encode()], []);
      equal(
        [...encoder.encode("A🍷\ud800")],
        [65, 240, 159, 141, 183, 239, 191, 189],
      );
      equal([...encoder.encode(null as never)], [110, 117, 108, 108]);
      rejects(() => encoder.encode(Symbol() as never), "TypeError");
    },
    encodeInto({ TextEncoder }) {
      const encoder = new TextEncoder();
      for (const [length, read, written] of [
        [0, 0, 0],
        [1, 1, 1],
        [4, 1, 1],
        [5, 3, 5],
        [6, 4, 6],
      ]) {
        const destination = new Uint8Array(length!);
        equal(encoder.encodeInto("A🍷B", destination), { read, written });
      }
      rejects(
        () => encoder.encodeInto("a", new Uint16Array(1) as never),
        "TypeError",
      );
      const backing = new Uint8Array(5).fill(99);
      equal(encoder.encodeInto("ab", backing.subarray(1, 3)), {
        read: 2,
        written: 2,
      });
      equal([...backing], [99, 97, 98, 99, 99]);
    },
    labels({ TextDecoder }) {
      for (const label of [undefined, "utf8", " UTF-8 "])
        equal(new TextDecoder(label).encoding, "utf-8");
      equal(new TextDecoder("latin1").encoding, "windows-1252");
      equal(new TextDecoder("windows-1252").decode(new Uint8Array([128])), "€");
      equal(new TextDecoder("utf-16le").decode(new Uint8Array([65, 0])), "A");
      equal(new TextDecoder("utf-16be").decode(new Uint8Array([0, 65])), "A");
      rejects(() => new TextDecoder("no-such-encoding"), "RangeError");
    },
    decoderOptions({ TextDecoder }) {
      const bytes = new Uint8Array([239, 187, 191, 65]);
      equal(new TextDecoder().decode(bytes), "A");
      equal(
        new TextDecoder("utf8", { ignoreBOM: true }).decode(bytes),
        "\ufeffA",
      );
      const decoder = new TextDecoder("utf8", { fatal: true, ignoreBOM: true });
      equal([decoder.fatal, decoder.ignoreBOM], [true, true]);
      rejects(() => decoder.decode(new Uint8Array([255])), "TypeError");
      equal(decoder.decode(new Uint8Array([65])), "A");
      equal(new TextDecoder().decode(new Uint8Array([255])), "\ufffd");
    },
    streaming({ TextDecoder }) {
      const decoder = new TextDecoder();
      equal(decoder.decode(new Uint8Array([240, 159]), { stream: true }), "");
      equal(decoder.decode(new Uint8Array([141, 183]), { stream: true }), "🍷");
      equal(decoder.decode(), "");
      equal(decoder.decode(new Uint8Array([240]), { stream: true }), "");
      equal(decoder.decode(), "\ufffd");
      const fatal = new TextDecoder("utf8", { fatal: true });
      fatal.decode(new Uint8Array([240]), { stream: true });
      rejects(() => fatal.decode(), "TypeError");
      equal(fatal.decode(new Uint8Array([65])), "A");
    },
    inputViews({ TextDecoder }) {
      const buffer = new Uint8Array([0, 65, 66, 0]).buffer;
      equal(new TextDecoder().decode(new DataView(buffer, 1, 2)), "AB");
      equal(new TextDecoder().decode(buffer), "\u0000AB\u0000");
      equal(new TextDecoder().decode(), "");
      rejects(() => new TextDecoder().decode("x" as never), "TypeError");
    },
  },
};
export class EncodingImplementation extends FeatureImplementation<
  typeof encodingFeature
> {
  constructor() {
    super(
      encodingFeature,
      Object.fromEntries(
        encodingFeature.cases.map((id) => [id, { status: "supported" }]),
      ) as never,
    );
  }
  create() {
    return api;
  }
}
