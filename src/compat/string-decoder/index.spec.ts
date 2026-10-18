import * as stringDecoder from "node:string_decoder";
import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";

/** node:string_decoder module contract, matching the Workers baseline. */
export interface NodeStringDecoderApi {
  StringDecoder: {
    new (encoding?: string): {
      encoding: string;
      lastChar: Uint8Array;
      lastNeed: number;
      lastTotal: number;
      write(buf: ArrayBufferView | DataView | string): string;
      end(buf?: ArrayBufferView | DataView | string): string;
      text(buf: ArrayBufferView | DataView | string, offset?: number): string;
    };
    prototype: unknown;
  };
  default?: NodeStringDecoderApi;
}

function equal(actual: unknown, expected: unknown, label?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `${label ? `${label}: ` : ""}${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
    );
}
function throws(
  fn: () => unknown,
  expected: { name?: string; code?: string; message?: RegExp },
) {
  try {
    fn();
  } catch (error) {
    const e = error as { name?: string; code?: string; message?: string };
    if (expected.name && e?.name !== expected.name)
      throw new Error(`Expected error name ${expected.name}, got ${e?.name}`);
    if (expected.code && e?.code !== expected.code)
      throw new Error(`Expected error code ${expected.code}, got ${e?.code}`);
    if (expected.message && !expected.message.test(String(e?.message)))
      throw new Error(
        `Expected message ${expected.message}, got ${e?.message}`,
      );
    return;
  }
  throw new Error(`Expected ${expected.name} to be thrown`);
}

export const nodeStringDecoderFeature = defineFeature<NodeStringDecoderApi>()(
  "node.string_decoder",
  [
    "utf8Streaming",
    "utf8Invalid",
    "utf16le",
    "singleByte",
    "hexAndBase64",
    "encodings",
    "state",
    "window",
    "text",
    "reuse",
    "endWithBuffer",
    "inputShapes",
    "invalidInputs",
    "constructorShape",
    "shape",
  ],
);

export const nodeStringDecoderContract: ContractSuite<
  typeof nodeStringDecoderFeature
> = {
  feature: nodeStringDecoderFeature,
  cases: {
    utf8Streaming(api) {
      const decoder = new api.StringDecoder();
      equal(decoder.write(new Uint8Array([0x61])), "a");
      // Chunk boundaries hold partial characters; no replacement is emitted.
      const partial = new api.StringDecoder();
      equal(partial.write(new Uint8Array([0xe3, 0x81])), "");
      equal(partial.write(new Uint8Array([0x82])), "あ");
      equal(partial.write(new Uint8Array([0xf0, 0x9f, 0x8d, 0xb7])), "🍷");
      const split = new api.StringDecoder();
      equal(split.write(new Uint8Array([0xf0, 0x9f])), "");
      equal(split.write(new Uint8Array([0x8d])), "");
      equal(split.write(new Uint8Array([0xb7])), "🍷");
      equal(split.end(), "");
      equal(new api.StringDecoder().end(new Uint8Array([0xe3, 0x81])), "�");
      // A leading BOM is decoded as U+FEFF, not stripped — whole or split
      // across chunk boundaries.
      const bom = new api.StringDecoder();
      equal(bom.write(new Uint8Array([0xef, 0xbb, 0xbf, 0x61])), "﻿a");
      const bomSplit = new api.StringDecoder();
      equal(bomSplit.write(new Uint8Array([0xef, 0xbb])), "");
      equal(bomSplit.write(new Uint8Array([0xbf, 0x61])), "﻿a");
    },
    utf8Invalid(api) {
      // Invalid bytes each emit their own replacement character; a lone
      // continuation byte produces one immediately.
      equal(new api.StringDecoder().write(new Uint8Array([0x80])), "�");
      equal(new api.StringDecoder().write(new Uint8Array([0xff])), "�");
      equal(new api.StringDecoder().write(new Uint8Array([0xc0])), "");
      equal(new api.StringDecoder().end(new Uint8Array([0xc0])), "�");
      // A buffered-but-invalid sequence flushes per byte at end() or when a
      // non-continuation byte arrives.
      const broken = new api.StringDecoder();
      equal(broken.write(new Uint8Array([0xe0, 0x80])), "");
      equal(broken.end(), "��");
      const interleave = new api.StringDecoder();
      equal(interleave.write(new Uint8Array([0xe0, 0x80])), "");
      equal(interleave.write(new Uint8Array([0x41])), "��A");
      const surrogate = new api.StringDecoder();
      equal(surrogate.write(new Uint8Array([0xed, 0xa0])), "");
      equal(surrogate.end(), "��");
    },
    utf16le(api) {
      for (const encoding of ["utf16le", "ucs2", "ucs-2", "utf-16le"]) {
        const decoder = new api.StringDecoder(encoding);
        equal(decoder.write(new Uint8Array([0x42, 0x30])), "あ");
      }
      const decoder = new api.StringDecoder("utf16le");
      equal(decoder.write(new Uint8Array([0x3c, 0xd8])), "");
      equal(decoder.write(new Uint8Array([0x77, 0xdf])), "🍷");
      // Odd trailing bytes are held; a lone high surrogate flushes as a
      // surrogate code unit at end().
      const odd = new api.StringDecoder("utf16le");
      equal(odd.write(new Uint8Array([0x42])), "");
      equal(odd.end(), "");
      const lone = new api.StringDecoder("utf16le");
      equal(lone.write(new Uint8Array([0x3c, 0xd8])), "");
      equal(lone.end(), "\ud83c");
      const byteAtTime = new api.StringDecoder("utf16le");
      equal(byteAtTime.write(new Uint8Array([0x42])), "");
      equal(byteAtTime.write(new Uint8Array([0x30])), "あ");
    },
    singleByte(api) {
      const latin1 = new api.StringDecoder("latin1");
      equal(latin1.write(new Uint8Array([0xe3, 0x81])), "ã\u0081");
      const binary = new api.StringDecoder("binary");
      equal(binary.encoding, "latin1");
      const ascii = new api.StringDecoder("ascii");
      equal(ascii.write(new Uint8Array([0xe3, 0x81])), "c\x01");
      equal(ascii.write(new Uint8Array([0xff, 0x61])), "\x7fa");
    },
    hexAndBase64(api) {
      const hex = new api.StringDecoder("hex");
      equal(hex.write(new Uint8Array([0x41, 0x42, 0x43])), "414243");
      equal(hex.write(new Uint8Array([0x44])), "44");
      // Trailing incomplete base64 groups are carried across writes.
      const base64 = new api.StringDecoder("base64");
      equal(base64.write(new Uint8Array([0x41])), "");
      equal(base64.write(new Uint8Array([0x42])), "");
      equal(base64.write(new Uint8Array([0x43])), "QUJD");
      equal(base64.write(new Uint8Array([0x41, 0x42])), "");
      equal(base64.end(), "QUI=");
      const url = new api.StringDecoder("base64url");
      equal(url.write(new Uint8Array([0xfb])), "");
      equal(url.end(), "-w");
      const url2 = new api.StringDecoder("base64url");
      equal(url2.write(new Uint8Array([0xfb, 0xff, 0xff])), "-___");
      // Plain base64 keeps the standard alphabet and padding.
      const std = new api.StringDecoder("base64");
      equal(std.write(new Uint8Array([0xfb, 0xff, 0xff])), "+///");
      const hexEnd = new api.StringDecoder("hex");
      equal(hexEnd.write(new Uint8Array([0x4])), "04");
      equal(hexEnd.end(), "");
    },
    encodings(api) {
      for (const [encoding, expected] of [
        ["utf8", "utf8"],
        ["utf-8", "utf8"],
        ["UTF8", "utf8"],
        ["UTF-8", "utf8"],
        ["utf16le", "utf16le"],
        ["ucs2", "utf16le"],
        ["ucs-2", "utf16le"],
        ["UCS-2", "utf16le"],
        ["utf-16le", "utf16le"],
        ["latin1", "latin1"],
        ["binary", "latin1"],
        ["BINARY", "latin1"],
        ["ascii", "ascii"],
        ["ASCII", "ascii"],
        ["base64", "base64"],
        ["BASE64", "base64"],
        ["base64url", "base64url"],
        ["BASE64URL", "base64url"],
        ["hex", "hex"],
        ["HEX", "hex"],
      ]) {
        equal(new api.StringDecoder(encoding).encoding, expected, encoding);
      }
      // null, undefined and '' all normalize to utf8 in Workers.
      for (const encoding of [null, undefined, ""]) {
        equal(
          new api.StringDecoder(encoding as unknown as string).encoding,
          "utf8",
          `encoding ${String(encoding)}`,
        );
      }
      for (const bad of ["bogus", "latin-1", "raw", "utf32", "utf-7"]) {
        throws(() => new api.StringDecoder(bad), {
          name: "TypeError",
          code: "ERR_UNKNOWN_ENCODING",
          message: new RegExp(`Unknown encoding: ${bad}`),
        });
      }
      throws(() => new api.StringDecoder(123 as unknown as string), {
        name: "TypeError",
        code: "ERR_UNKNOWN_ENCODING",
      });
      throws(() => new api.StringDecoder({} as unknown as string), {
        name: "TypeError",
        code: "ERR_UNKNOWN_ENCODING",
      });
    },
    state(api) {
      // Prototype getters expose the pending-sequence counters; they reset
      // when the sequence completes or is flushed.
      const decoder = new api.StringDecoder("utf8");
      equal(decoder.lastNeed, 0);
      equal(decoder.lastTotal, 0);
      equal([...decoder.lastChar], [0, 0, 0, 0]);
      decoder.write(new Uint8Array([0xe3, 0x81]));
      equal(decoder.lastNeed, 1);
      equal(decoder.lastTotal, 3);
      decoder.write(new Uint8Array([0x82]));
      equal(decoder.lastNeed, 0);
      equal(decoder.lastTotal, 0);
      const incomplete = new api.StringDecoder("utf8");
      incomplete.write(new Uint8Array([0xf0, 0x9f]));
      equal(incomplete.lastNeed, 2);
      equal(incomplete.lastTotal, 4);
      incomplete.write(new Uint8Array([0x8d]));
      equal(incomplete.lastNeed, 1);
      equal(incomplete.lastTotal, 4);
      incomplete.end();
      equal(incomplete.lastNeed, 0);
      equal(incomplete.lastTotal, 0);
      const base64 = new api.StringDecoder("base64");
      base64.write(new Uint8Array([0x41]));
      equal(base64.lastNeed, 2);
      equal(base64.lastTotal, 3);
      base64.write(new Uint8Array([0x42]));
      equal(base64.lastNeed, 1);
      const utf16 = new api.StringDecoder("utf16le");
      utf16.write(new Uint8Array([0x42]));
      equal(utf16.lastNeed, 1);
      equal(utf16.lastTotal, 2);
      // The held odd byte pairs with the next write's first byte, so only
      // the trailing byte remains buffered.
      utf16.write(new Uint8Array([0x3c, 0xd8]));
      equal(utf16.lastNeed, 1);
      equal(utf16.lastTotal, 2);
      utf16.end();
      equal(utf16.lastNeed, 0);
      equal(utf16.lastTotal, 0);
      // Single-byte encodings never report pending state.
      const latin1 = new api.StringDecoder("latin1");
      latin1.write(new Uint8Array([0xe3]));
      equal(latin1.lastNeed, 0);
      equal(latin1.lastTotal, 0);
    },
    window(api) {
      // lastChar retains the buffered byte run, including after the
      // counters reset; single-byte encodings leave it zeroed.
      const decoder = new api.StringDecoder("utf8");
      decoder.write(new Uint8Array([0xe3, 0x81]));
      equal([...decoder.lastChar], [0xe3, 0x81, 0, 0]);
      decoder.write(new Uint8Array([0x82]));
      equal([...decoder.lastChar], [0xe3, 0x81, 0x82, 0]);
      decoder.write(new Uint8Array([0x41]));
      equal([...decoder.lastChar], [0xe3, 0x81, 0x82, 0]);
      decoder.end();
      equal([...decoder.lastChar], [0xe3, 0x81, 0x82, 0]);
      const wide = new api.StringDecoder("utf8");
      wide.write(new Uint8Array([0xf0, 0x9f]));
      equal([...wide.lastChar], [0xf0, 0x9f, 0, 0]);
      wide.write(new Uint8Array([0x8d, 0xb7]));
      equal([...wide.lastChar], [0xf0, 0x9f, 0x8d, 0xb7]);
      // Bytes outside a pending sequence never enter the window.
      const fresh = new api.StringDecoder("utf8");
      fresh.write(new Uint8Array([0xed, 0xa0, 0x80]));
      equal([...fresh.lastChar], [0, 0, 0, 0]);
      const utf16 = new api.StringDecoder("utf16le");
      utf16.write(new Uint8Array([0x3c, 0xd8]));
      equal([...utf16.lastChar], [0x3c, 0xd8, 0, 0]);
      utf16.write(new Uint8Array([0x77, 0xdf]));
      equal([...utf16.lastChar], [0x3c, 0xd8, 0x77, 0xdf]);
      const latin1 = new api.StringDecoder("latin1");
      latin1.write(new Uint8Array([0xe3, 0x81]));
      equal([...latin1.lastChar], [0, 0, 0, 0]);
    },
    text(api) {
      const decoder = new api.StringDecoder("utf8");
      equal(decoder.text(new Uint8Array([0x61, 0x62])), "ab");
      // text() decodes buf.slice(offset) after clearing buffered state.
      const utf16 = new api.StringDecoder("utf16le");
      utf16.write(new Uint8Array([0x42]));
      equal(utf16.text(new Uint8Array([0x42, 0x30, 0x44, 0x30])), "あい");
      equal(utf16.lastNeed, 0);
      // Pending state is discarded, not completed, before the slice decodes.
      const partial = new api.StringDecoder("utf8");
      partial.write(new Uint8Array([0xe3, 0x81]));
      equal(partial.text(new Uint8Array([0xe3, 0x81, 0x82, 0x41]), 1), "��A");
      equal(partial.lastNeed, 0);
      const offset = new api.StringDecoder("utf8");
      equal(offset.text(new Uint8Array([0xe3, 0x81, 0x82, 0x41]), 3), "A");
      const latin = new api.StringDecoder("latin1");
      equal(latin.text(new Uint8Array([0xe3, 0x81]), 1), "\x81");
    },
    reuse(api) {
      const decoder = new api.StringDecoder("utf8");
      equal(decoder.end(), "");
      equal(decoder.write(new Uint8Array([0x61])), "a");
      equal(decoder.end(), "");
      decoder.write(new Uint8Array([0xe3, 0x81]));
      equal(decoder.end(), "�");
      // end() flushes but does not close; the decoder stays usable.
      equal(decoder.write(new Uint8Array([0x62])), "b");
      equal(decoder.end(new Uint8Array([0x63])), "c");
      // Pending state is fully cleared by end() for every encoding:
      // held bytes are never re-consumed by a later write.
      const utf16 = new api.StringDecoder("utf16le");
      equal(utf16.write(new Uint8Array([0x42])), "");
      equal(utf16.end(), "");
      equal(utf16.write(new Uint8Array([0x42, 0x43])), "䍂");
      equal(utf16.end(), "");
      const b64 = new api.StringDecoder("base64");
      equal(b64.write(new Uint8Array([0x41])), "");
      equal(b64.end(), "QQ==");
      equal(b64.write(new Uint8Array([0x42, 0x43])), "");
      equal(b64.end(), "QkM=");
      const b64url = new api.StringDecoder("base64url");
      equal(b64url.write(new Uint8Array([0xfb])), "");
      equal(b64url.end(), "-w");
      equal(b64url.write(new Uint8Array([0xfb, 0xff])), "");
      equal(b64url.end(), "-_8");
      const utf8 = new api.StringDecoder("utf8");
      equal(utf8.write(new Uint8Array([0xe3, 0x81])), "");
      equal(utf8.end(), "�");
      equal(utf8.write(new Uint8Array([0x61, 0x62])), "ab");
      equal(utf8.end(), "");
    },
    endWithBuffer(api) {
      const decoder = new api.StringDecoder("utf8");
      equal(decoder.end(new Uint8Array([0x61, 0x62])), "ab");
      const partial = new api.StringDecoder("utf8");
      equal(partial.end(new Uint8Array([0xe3, 0x81, 0x82])), "あ");
      const utf16 = new api.StringDecoder("utf16le");
      equal(utf16.end(new Uint8Array([0x42, 0x30])), "あ");
    },
    inputShapes(api) {
      const bytes = new Uint8Array([0x61, 0x62, 0x63, 0x64]);
      const view = new Uint8Array(bytes.buffer, 1, 2);
      const decoder = new api.StringDecoder("utf8");
      equal(decoder.write(view), "bc");
      equal(decoder.end(new DataView(bytes.buffer, 1, 2)), "bc");
      const str = new api.StringDecoder("utf8");
      equal(str.write("direct"), "direct");
      equal(str.end("tail"), "tail");
      // Int8Array and Uint16Array views decode by byte content.
      equal(
        new api.StringDecoder("utf8").write(new Int8Array([-32, -128])),
        "",
      );
      const i16 = new api.StringDecoder("utf16le");
      equal(i16.write(new Uint16Array([0x3042])), "あ");
    },
    invalidInputs(api) {
      const decoder = new api.StringDecoder("utf8");
      for (const bad of [
        123,
        false,
        null,
        new ArrayBuffer(1),
        Object.create(null),
      ]) {
        throws(() => decoder.write(bad as unknown as string), {
          name: "TypeError",
          code: "ERR_INVALID_ARG_TYPE",
          message:
            /The "buf" argument must be of type string or an instance of Buffer, TypedArray, or DataView/,
        });
      }
      // The "Received" suffix is structural; it never calls user toString.
      throws(() => decoder.write(Object.create(null) as unknown as string), {
        name: "TypeError",
        code: "ERR_INVALID_ARG_TYPE",
        message: /Received \[Object: null prototype\]/,
      });
      // Null-prototype inputs must not be enumerated: cyclic references and
      // throwing getters cannot reach the error formatting path.
      const cyclic = Object.create(null);
      cyclic.self = cyclic;
      throws(() => decoder.write(cyclic as unknown as string), {
        name: "TypeError",
        code: "ERR_INVALID_ARG_TYPE",
        message: /Received \[Object: null prototype\]/,
      });
      const getterful = Object.create(null, {
        boom: {
          enumerable: true,
          get() {
            throw new Error("getter invoked");
          },
        },
      });
      throws(() => decoder.write(getterful as unknown as string), {
        name: "TypeError",
        code: "ERR_INVALID_ARG_TYPE",
        message: /Received \[Object: null prototype\]/,
      });
      const cyclicPlain = { self: {} as unknown };
      cyclicPlain.self = cyclicPlain;
      throws(() => decoder.write(cyclicPlain as unknown as string), {
        name: "TypeError",
        code: "ERR_INVALID_ARG_TYPE",
      });
      throws(() => decoder.write(123 as unknown as string), {
        name: "TypeError",
        code: "ERR_INVALID_ARG_TYPE",
        message: /Received type number \(123\)/,
      });
      // write/end/text reject receivers that are not StringDecoders.
      for (const method of ["write", "end", "text"] as const) {
        const fn = (
          api.StringDecoder.prototype as Record<
            string,
            (this: unknown, arg: Uint8Array) => string
          >
        )[method];
        throws(() => fn.call({ encoding: "utf8" }, new Uint8Array(1)), {
          name: "TypeError",
          code: "ERR_INVALID_THIS",
          message: /Value of "this" must be of type StringDecoder/,
        });
      }
    },
    constructorShape(api) {
      const decoder = new api.StringDecoder("utf8");
      equal(decoder instanceof api.StringDecoder, true);
      equal(Object.getOwnPropertyNames(decoder).sort(), ["encoding"]);
      equal(Object.getOwnPropertyNames(api.StringDecoder.prototype).sort(), [
        "constructor",
        "end",
        "lastChar",
        "lastNeed",
        "lastTotal",
        "text",
        "write",
      ]);
      // Called without new it still constructs a usable decoder.
      const fn = api.StringDecoder as unknown as (encoding?: string) => {
        encoding: string;
      };
      equal(fn.call({}, "ascii").encoding, "ascii");
      equal(decoder.encoding, "utf8");
    },
    shape(api) {
      equal(typeof api.StringDecoder, "function");
      equal(api.StringDecoder.name, "StringDecoder");
      equal(api.default?.StringDecoder === api.StringDecoder, true);
    },
  },
};

const supported = { status: "supported" } as const;

export class NodeStringDecoder extends FeatureImplementation<
  typeof nodeStringDecoderFeature
> {
  constructor() {
    super(nodeStringDecoderFeature, {
      utf8Streaming: supported,
      utf8Invalid: supported,
      utf16le: supported,
      singleByte: supported,
      hexAndBase64: supported,
      encodings: supported,
      state: supported,
      window: supported,
      text: supported,
      reuse: supported,
      endWithBuffer: supported,
      inputShapes: supported,
      invalidInputs: supported,
      constructorShape: supported,
      shape: supported,
    });
  }
  create() {
    return stringDecoder as unknown as NodeStringDecoderApi;
  }
}
