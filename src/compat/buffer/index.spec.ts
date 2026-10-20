import * as buffer from "node:buffer";
import * as bareBuffer from "buffer";
import {
  defineFeature,
  FeatureImplementation,
} from "workers-capacitor/shared/contracts";
import type { ContractSuite } from "workers-capacitor/shared/contracts/testing";

type Api = typeof import("./index.js");
function equal(actual: unknown, expected: unknown, label = "") {
  const json = (value: unknown) =>
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? `${v}n` : v));
  const primitive = (value: unknown) =>
    value === null ||
    (typeof value !== "object" && typeof value !== "function");
  const matches =
    primitive(actual) || primitive(expected)
      ? Object.is(actual, expected)
      : json(actual) === json(expected);
  if (!matches)
    throw new Error(`${label}: ${json(actual)} != ${json(expected)}`);
}
function check(value: unknown, label: string) {
  if (!value) throw new Error(label);
}
function error(
  fn: () => unknown,
  name: string,
  code?: string,
  message?: RegExp,
) {
  try {
    fn();
  } catch (e) {
    const actual = e as Error & { code?: string };
    equal(actual.name, name);
    if (code) equal(actual.code, code);
    if (message) check(message.test(actual.message), actual.message);
    return;
  }
  throw new Error(`Expected ${name}`);
}
const operations = [
  "exports",
  "prototype",
  "allocation",
  "construction",
  "coercion",
  "sharing",
  "encodings",
  "invalidEncoding",
  "byteLength",
  "concat",
  "comparison",
  "search",
  "fill",
  "copy",
  "swaps",
  "integers",
  "bigints",
  "floats",
  "numericErrors",
  "sliceWrite",
  "inspection",
  "validation",
  "transcode",
  "blobFile",
] as const;
export const bufferFeature = defineFeature<Api>()("node.buffer", operations);
export const bufferContract: ContractSuite<typeof bufferFeature> = {
  feature: bufferFeature,
  cases: {
    exports(b) {
      equal(Object.keys(b).sort(), surface.exports);
      for (const name of surface.exports.filter((n) => n !== "default")) {
        check((b as any)[name] === (b as any).default[name], `default ${name}`);
        check((b as any)[name] === (bareBuffer as any)[name], `bare ${name}`);
      }
      equal(Reflect.ownKeys(b.Buffer).map(String).sort(), surface.statics);
      equal(
        [
          b.constants.MAX_LENGTH,
          b.kMaxLength,
          b.constants.MAX_STRING_LENGTH,
          b.kStringMaxLength,
          b.INSPECT_MAX_BYTES,
        ],
        [2147483647, 2147483647, 536870888, 536870888, 50],
      );
      error(
        () => b.resolveObjectURL("blob:any"),
        "Error",
        undefined,
        /resolveObjectURL is not implemented/,
      );
    },
    prototype({ Buffer: B }) {
      equal(Reflect.ownKeys(B.prototype).map(String).sort(), surface.prototype);
      check(
        Object.getPrototypeOf(B.prototype) === Uint8Array.prototype,
        "Uint8Array inheritance",
      );
      const a = B.from([1, 2]);
      check(a instanceof Uint8Array && B.isBuffer(a), "brand");
      check(
        !B.isBuffer(new Uint8Array(2)) && !B.isBuffer({ _isBuffer: true }),
        "no spoof",
      );
      check(
        B.isBuffer(a.subarray(0, 1)) && B.isBuffer(a.map((v) => v + 1)),
        "species",
      );
      for (const key of surface.prototype.filter((k) => k.includes("Uint")))
        check(
          (B.prototype as any)[key] ===
            (B.prototype as any)[key.replace("Uint", "UInt")],
          key,
        );
      check(
        B.prototype.toLocaleString === B.prototype.toString,
        "locale alias",
      );
    },
    allocation({ Buffer: B, SlowBuffer }) {
      equal((B as typeof B & { poolSize: number }).poolSize, 0);
      check(
        Object.getOwnPropertyDescriptor(B, "poolSize")!.writable === false,
        "readonly pool",
      );
      for (const alloc of [
        B.alloc,
        B.allocUnsafe,
        B.allocUnsafeSlow,
        SlowBuffer,
      ]) {
        equal(Array.from(alloc(4)), [0, 0, 0, 0]);
        check(alloc(2).buffer !== alloc(2).buffer, "no pool");
      }
      equal(Array.from(B.alloc(5, "ab")), [97, 98, 97, 98, 97]);
      error(() => B.alloc(-1), "RangeError");
      error(() => B.alloc("2" as any), "TypeError", "ERR_INVALID_ARG_TYPE");
    },
    construction({ Buffer: B }) {
      equal(Array.from(B.of(257, -1, 3)), [1, 255, 3]);
      equal(Array.from(B([1, 2] as any)), [1, 2]);
      equal(
        Array.from(new (B as unknown as { new (size: number): Uint8Array })(2)),
        [0, 0],
      );
      equal(B.from({ type: "Buffer", data: [3, 4] } as any).toJSON(), {
        type: "Buffer",
        data: [3, 4],
      });
      equal(Array.from(B.from(new Uint16Array([257, 258]) as any)), [1, 2]);
      equal(Array.from(B.from(new DataView(new ArrayBuffer(4)) as any)), []);
      error(() => B.from(2 as any), "TypeError", "ERR_INVALID_ARG_TYPE");
    },
    coercion({ Buffer: B }) {
      equal(B.from({ valueOf: () => "ab" }).toString(), "ab");
      equal(B.from({ [Symbol.toPrimitive]: () => "cd" }).toString(), "cd");
      equal(
        Array.from(B.from({ length: 3, 0: 257, 1: -1 } as any)),
        [1, 255, 0],
      );
      equal(Array.from(B.from({ length: NaN } as any)), []);
      error(() => B.from(null as any), "TypeError", "ERR_INVALID_ARG_TYPE");
    },
    sharing({ Buffer: B }) {
      const raw = new Uint8Array([1, 2, 3, 4]);
      const shared = B.from(raw.buffer, 1, 2),
        copied = B.from(raw);
      raw[1] = 9;
      equal(Array.from(shared), [9, 3]);
      equal(Array.from(copied), [1, 2, 3, 4]);
      const slice = shared.slice(0, 1);
      slice[0] = 7;
      equal(raw[1], 7);
      check(
        shared.parent === raw.buffer &&
          (shared as typeof shared & { offset: number }).offset === 1,
        "parent offset",
      );
      error(
        () => B.from(raw.buffer, 9),
        "RangeError",
        "ERR_BUFFER_OUT_OF_BOUNDS",
      );
    },
    encodings({ Buffer: B }) {
      for (const encoding of [
        "utf8",
        "UTF-8",
        "utf16le",
        "UCS-2",
        "latin1",
        "binary",
        "ascii",
        "hex",
        "base64",
        "base64url",
      ])
        check(B.isEncoding(encoding), encoding);
      equal(B.from("é😀").toString(), "é😀");
      equal(B.from("\ud800", "utf16le").toString("utf16le"), "\ud800");
      equal(B.from([0xef, 0xbb, 0xbf, 65]).toString(), "\ufeffA");
      equal(B.from([0xc0, 0xaf]).toString(), "��");
      equal(B.from([0x41, 0, 0x42]).toString("utf16le"), "A");
      equal(B.from([0x80, 0xff]).toString("latin1"), "\x80\xff");
      equal(B.from([0x80, 0xff]).toString("ascii"), "\0\x7f");
      equal(B.from("SGV!s bG8_", "base64").toString(), "Hello?");
      equal(B.from([251, 255]).toString("base64url"), "-_8");
      equal(B.from("aabbz1", "hex").toString("hex"), "aabb");
      equal(B.from("abc", "hex").toString("hex"), "ab");
    },
    invalidEncoding({ Buffer: B }) {
      check(
        !B.isEncoding(null) && !B.isEncoding({}) && !B.isEncoding("wat"),
        "encoding guard",
      );
      error(
        () => B.from("a", "wat" as any),
        "TypeError",
        "ERR_UNKNOWN_ENCODING",
      );
      error(
        () => B.from([1]).toString("wat" as any),
        "TypeError",
        "ERR_UNKNOWN_ENCODING",
      );
      error(
        () => B.alloc(3).write("x", 0, 3, "wat" as any),
        "TypeError",
        "ERR_UNKNOWN_ENCODING",
      );
      error(
        () => B.alloc(3).fill("x", 0, 3, "wat" as any),
        "TypeError",
        "ERR_UNKNOWN_ENCODING",
      );
    },
    byteLength({ Buffer: B }) {
      equal(
        [
          B.byteLength("é😀"),
          B.byteLength("é😀", "utf16le"),
          B.byteLength("é😀", "ascii"),
          B.byteLength("abcd", "hex"),
          B.byteLength("YQ==", "base64"),
          B.byteLength(new Uint16Array(3)),
          B.byteLength(new ArrayBuffer(7)),
        ],
        [6, 6, 3, 2, 1, 6, 7],
      );
      error(() => B.byteLength(4 as any), "TypeError", "ERR_INVALID_ARG_TYPE");
    },
    concat({ Buffer: B }) {
      const a = B.from([1, 2]);
      equal(Array.from(B.concat([a, new Uint8Array([3])], 5)), [1, 2, 3, 0, 0]);
      equal(Array.from(B.concat([a, a], 3)), [1, 2, 1]);
      equal(B.concat([]).length, 0);
      error(() => B.concat(["x"] as any), "TypeError");
      error(() => B.concat([new Uint16Array([257, 258])] as any), "TypeError");
      error(
        () =>
          B.concat([
            { length: 2, subarray: () => new Uint8Array([9, 9]) },
          ] as any),
        "TypeError",
      );
      const modified = new Uint8Array([1, 2]);
      modified.subarray = () => new Uint8Array([9, 9]);
      equal(Array.from(B.concat([modified])), [1, 2]);
    },
    comparison({ Buffer: B }) {
      const a = B.from([1, 2, 3]);
      equal(
        [
          B.compare(a, new Uint8Array([1, 2, 3])),
          B.compare(a, B.from([1, 2])),
          B.compare(a, B.from([2])),
        ],
        [0, 1, -1],
      );
      equal(a.compare(B.from([9, 2, 9]), 1, 2, 1, 2), 0);
      check(a.equals(B.from([1, 2, 3])), "equals");
      error(() => a.equals("x" as any), "TypeError", "ERR_INVALID_ARG_TYPE");
    },
    search({ Buffer: B }) {
      const a = B.from("abcabc");
      equal(
        [
          a.indexOf("bc"),
          a.lastIndexOf("bc"),
          a.indexOf(97, -3),
          a.indexOf(""),
          a.lastIndexOf(""),
          a.indexOf("x"),
          a.includes("ca"),
        ],
        [1, 4, 3, 0, 6, -1, true],
      );
      const wide = B.from("ababa", "utf16le");
      equal(
        [
          wide.indexOf("ba", 1, "utf16le"),
          wide.lastIndexOf("ba", 99, "utf16le"),
        ],
        [2, 6],
      );
      error(() => a.indexOf({} as any), "TypeError", "ERR_INVALID_ARG_TYPE");
    },
    fill({ Buffer: B }) {
      equal(Array.from(B.alloc(5).fill(B.from([1, 2]))), [1, 2, 1, 2, 1]);
      equal(Array.from(B.alloc(4).fill("ab", 1, 3)), [0, 97, 98, 0]);
      equal(Array.from(B.alloc(2, 9).fill("")), [0, 0]);
      error(
        () => B.alloc(2).fill("a", "hex"),
        "TypeError",
        undefined,
        /valid hex/,
      );
      error(
        () => B.alloc(2).fill(B.alloc(0)),
        "TypeError",
        "ERR_INVALID_ARG_VALUE",
      );
      error(() => B.alloc(2).fill(1, -1), "RangeError", "ERR_OUT_OF_RANGE");
    },
    copy({ Buffer: B }) {
      const a = B.from([1, 2, 3, 4]);
      equal(a.copy(a, 1, 0, 3), 3);
      equal(Array.from(a), [1, 1, 2, 3]);
      const dest = new Uint8Array(2);
      equal(a.copy(dest, 0, 1), 2);
      equal(Array.from(dest), [1, 2]);
      error(() => a.copy({} as any), "TypeError", "ERR_INVALID_ARG_TYPE");
    },
    swaps({ Buffer: B }) {
      for (const width of [2, 4, 8]) {
        const b = B.from(Array.from({ length: width * 2 }, (_, i) => i));
        check((b as any)[`swap${width * 8}`]() === b, "in place");
        equal(
          Array.from(b),
          Array.from(
            { length: width * 2 },
            (_, i) => Math.floor(i / width) * width + width - 1 - (i % width),
          ),
        );
        error(
          () => (B.alloc(width + 1) as any)[`swap${width * 8}`](),
          "RangeError",
          "ERR_INVALID_BUFFER_SIZE",
        );
      }
    },
    integers({ Buffer: B }) {
      const raw = B.from([0x12, 0x34, 0x56, 0x78]);
      equal(raw.readUInt32BE(), 0x12345678);
      equal(raw.readUInt32LE(), 0x78563412);
      const written = B.alloc(4);
      written.writeUInt32BE(0x12345678);
      equal(Array.from(written), [0x12, 0x34, 0x56, 0x78]);
      written.writeInt32LE(-2);
      equal(Array.from(written), [0xfe, 0xff, 0xff, 0xff]);
      for (const order of ["LE", "BE"])
        for (const size of [1, 2, 3, 4, 5, 6])
          for (const signed of [false, true]) {
            const suffix = signed ? "Int" : "UInt",
              max = signed ? 2 ** (size * 8 - 1) - 1 : 2 ** (size * 8) - 1;
            for (const value of [
              0,
              1,
              max,
              ...(signed ? [-1, -max - 1] : []),
            ]) {
              const a = B.alloc(10) as any;
              equal(a[`write${suffix}${order}`](value, 1, size), 1 + size);
              equal(a[`read${suffix}${order}`](1, size), value);
              if ([1, 2, 4].includes(size)) {
                const name = `${suffix}${size * 8}${size === 1 ? "" : order}`;
                equal(a[`write${name}`](value, 1), 1 + size);
                equal(a[`read${name}`](1), value);
              }
            }
          }
    },
    bigints({ Buffer: B }) {
      const raw = B.from([1, 2, 3, 4, 5, 6, 7, 8]);
      equal(raw.readBigUInt64BE(), 0x0102030405060708n);
      equal(raw.readBigUInt64LE(), 0x0807060504030201n);
      raw.writeBigUInt64LE(0x0102030405060708n);
      equal(Array.from(raw), [8, 7, 6, 5, 4, 3, 2, 1]);
      for (const order of ["LE", "BE"])
        for (const signed of [false, true])
          for (const value of signed
            ? [0n, -1n, -(2n ** 63n), 2n ** 63n - 1n]
            : [0n, 2n ** 64n - 1n]) {
            const a = B.alloc(10) as any,
              name = `Big${signed ? "Int" : "UInt"}64${order}`;
            equal(a[`write${name}`](value, 1), 9);
            equal(a[`read${name}`](1), value);
          }
    },
    floats({ Buffer: B }) {
      equal(B.from([0x3f, 0xc0, 0, 0]).readFloatBE(), 1.5);
      equal(B.from([0, 0, 0, 0, 0, 0, 0xf8, 0x3f]).readDoubleLE(), 1.5);
      const raw = B.alloc(8);
      raw.writeDoubleBE(1.5);
      equal(Array.from(raw), [0x3f, 0xf8, 0, 0, 0, 0, 0, 0]);
      raw.writeFloatLE(1.5);
      equal(Array.from(raw.slice(0, 4)), [0, 0, 0xc0, 0x3f]);
      for (const order of ["LE", "BE"])
        for (const kind of ["Float", "Double"])
          for (const value of [0, -0, 1.5, -2.25, Infinity, -Infinity, NaN]) {
            const a = B.alloc(10) as any;
            equal(
              a[`write${kind}${order}`](value, 1),
              1 + (kind === "Float" ? 4 : 8),
            );
            check(
              Object.is(a[`read${kind}${order}`](1), value),
              `${kind} ${value}`,
            );
          }
    },
    numericErrors({ Buffer: B }) {
      error(
        () => B.alloc(1).readUInt32LE(0),
        "RangeError",
        "ERR_BUFFER_OUT_OF_BOUNDS",
      );
      error(
        () => B.alloc(4).readUInt16LE(-1),
        "RangeError",
        "ERR_OUT_OF_RANGE",
      );
      error(() => B.alloc(4).writeUInt8(256), "RangeError", "ERR_OUT_OF_RANGE");
      error(
        () => B.alloc(8).readUIntLE(0, 7),
        "RangeError",
        "ERR_OUT_OF_RANGE",
      );
      error(
        () => B.alloc(8).writeBigUInt64LE(-1n),
        "RangeError",
        "ERR_OUT_OF_RANGE",
      );
    },
    sliceWrite({ Buffer: B }) {
      for (const [prefix, enc, text] of [
        ["ascii", "ascii", "abc"],
        ["latin1", "latin1", "é"],
        ["base64", "base64", "YWI="],
        ["base64url", "base64url", "-_8"],
        ["hex", "hex", "abcd"],
        ["ucs2", "utf16le", "ab"],
        ["utf8", "utf8", "😀"],
      ]) {
        const a = B.alloc(12) as any;
        const length = a[`${prefix}Write`](text, 1, 10);
        equal(
          a[`${prefix}Slice`](1, 1 + length),
          B.from(text, enc as any).toString(enc as any),
          prefix,
        );
      }
      equal(B.alloc(3).write("😀"), 0);
      equal(B.alloc(3).write("ab", 0, 3, "utf16le"), 2);
      equal(B.alloc(3).write("abc"), 3);
      for (const enc of ["base64", "base64url"]) {
        equal(Array.from(B.from("őQ==", enc)), [65]);
        equal(B.alloc(10).write("őQ==", 0, 10, enc), 0);
      }
    },
    inspection({ Buffer: B }) {
      equal((B.from([0, 255]) as any).inspect(), "<Buffer 00 ff>");
      equal((B.alloc(0) as any).inspect(), "<Buffer >");
      check(
        (B.alloc(51) as any).inspect().endsWith(" ... 1 more byte>"),
        "inspect limit",
      );
      equal(B.from([1, 2]).toJSON(), { type: "Buffer", data: [1, 2] });
      const extra = B.from([0, 1]) as any;
      extra.extra = "text";
      extra["01"] = "non-index";
      Object.defineProperty(extra, "hidden", { value: 7 });
      extra[Symbol.for("buffer-review")] = true;
      equal(
        extra.inspect(2, { showHidden: false, colors: false, depth: 2 }),
        "<Buffer 00 01, extra: 'text', '01': 'non-index', Symbol(buffer-review): true>",
      );
      equal(
        extra.inspect(2, { showHidden: true, colors: false, depth: 2 }),
        "<Buffer 00 01, extra: 'text', '01': 'non-index', hidden: 7, Symbol(buffer-review): true>",
      );
    },
    validation(b) {
      check(
        b.isAscii(new Uint8Array([0, 127])) &&
          !b.isAscii(new Uint8Array([128])),
        "ascii",
      );
      check(
        b.isUtf8(new Uint8Array([0xf0, 0x9f, 0x98, 0x80])) &&
          !b.isUtf8(new Uint8Array([0xc0, 0xaf])),
        "utf8",
      );
      check(
        b.isUtf8(new Uint8Array(new Uint8Array([255, 65, 255]).buffer, 1, 1)),
        "view window",
      );
      for (const value of [
        new DataView(new ArrayBuffer(4)),
        new Uint16Array(2),
        new ArrayBuffer(2),
        {},
        null,
      ]) {
        error(() => b.isUtf8(value as any), "TypeError");
        error(() => b.isAscii(value as any), "TypeError");
      }
      const bytes = new Uint8Array([65]);
      structuredClone(bytes, { transfer: [bytes.buffer] });
      error(() => b.isUtf8(bytes), "Error", undefined, /detached/);
      error(() => b.isAscii(bytes), "Error", undefined, /detached/);
      equal(b.atob(b.btoa("a\0ÿ")), "a\0ÿ");
      error(() => b.btoa("😀"), "InvalidCharacterError");
    },
    transcode(b) {
      for (const [from, to, bytes, expected] of transcodeVectors) {
        let actual: unknown;
        try {
          actual = Array.from(
            b.transcode(new Uint8Array(bytes), from as any, to as any),
          );
        } catch (e) {
          const err = e as Error;
          actual = { name: err.name, message: err.message };
        }
        equal(actual, expected, `${from}->${to}: ${bytes}`);
      }
      for (const to of ["latin1", "ascii"])
        equal(
          Array.from(
            b.transcode(new Uint8Array([255, 254, 65, 0]), "utf16le", to),
          ),
          [65],
        );
      for (const to of ["latin1", "ascii"]) {
        equal(
          Array.from(
            b.transcode(new Uint8Array([65, 239, 187, 191, 66]), "utf8", to),
          ),
          [65, 66],
        );
        equal(
          Array.from(
            b.transcode(
              new Uint8Array([65, 0, 255, 254, 66, 0]),
              "utf16le",
              to,
            ),
          ),
          [65, 66],
        );
      }
      const ignorable = [
        0x034f, 0x061c, 0x115f, 0x1160, 0x17b4, 0x180b, 0x200b, 0x200d, 0x202a,
        0x2060, 0x3164, 0xfe00, 0xfeff, 0xffa0, 0xfff0, 0x1bca0, 0x1d173,
        0xe0001, 0xe0100,
      ];
      for (const from of ["utf8", "utf16le"])
        for (const to of ["latin1", "ascii"]) {
          const text = "A" + String.fromCodePoint(...ignorable) + "\u00adB";
          equal(
            Array.from(b.transcode(b.Buffer.from(text, from), from, to)),
            [65, 173, 66],
          );
        }
      for (const from of ["utf8", "hex", "base64", "base64url"])
        for (const to of ["utf8", "hex", "base64", "base64url"])
          if (from !== "utf8" || to !== "utf8")
            error(
              () => b.transcode(new Uint8Array(), from as any, to as any),
              "Error",
              undefined,
              /unsupported encoding/,
            );
      error(
        () => b.transcode(new Uint8Array(), "wat" as any, "utf8"),
        "TypeError",
        "ERR_UNKNOWN_ENCODING",
      );
    },
    async blobFile(b) {
      check(
        b.Blob === globalThis.Blob && b.File === globalThis.File,
        "global constructors",
      );
      const mutable = Uint8Array.of(65);
      const delayed = new b.Blob([
        mutable,
        {
          toString() {
            mutable[0] = 66;
            return "";
          },
        } as any,
      ]);
      equal(Array.from(await delayed.bytes()), [66]);
      const order: string[] = [];
      const ordered = new b.File([mutable], "x", {
        get type() {
          order.push("type");
          mutable[0] = 67;
          return "TEXT/PLAIN";
        },
        get lastModified() {
          order.push("lastModified");
          return 12.5;
        },
        get endings() {
          order.push("endings");
          return undefined;
        },
      });
      equal(order, ["type", "lastModified", "endings"]);
      equal([ordered.lastModified, await ordered.text()], [12.5, "C"]);
      equal(
        await new b.Blob([
          { [Symbol.toStringTag]: "ArrayBuffer" } as any,
        ]).text(),
        "[object ArrayBuffer]",
      );
      class ChildBlob extends b.Blob {}
      class ChildFile extends b.File {}
      check(!(new b.Blob() instanceof ChildBlob), "Blob subclass brand");
      check(!(new b.File([], "x") instanceof ChildFile), "File subclass brand");
      check(new ChildBlob() instanceof ChildBlob, "Blob subclass instance");
      check(
        new ChildFile([], "x") instanceof ChildFile,
        "File subclass instance",
      );
      const overridden = Uint8Array.of(68);
      Object.defineProperty(overridden, "buffer", {
        get() {
          throw new Error("own buffer getter");
        },
      });
      equal(await new b.Blob([overridden]).text(), "D");
      const bytes = new Uint8Array([65]);
      const blob = new b.Blob([bytes, "é"], { type: "TEXT/PLAIN" });
      bytes[0] = 90;
      equal([blob.size, blob.type, await blob.text()], [3, "text/plain", "Aé"]);
      equal(
        Array.from(new Uint8Array(await blob.slice(1).arrayBuffer())),
        [195, 169],
      );
      const file = new b.File([blob], "test.txt", {
        lastModified: 123,
        type: "text/plain",
      });
      equal(
        [file.name, file.lastModified, file.size, await file.text()],
        ["test.txt", 123, 3, "Aé"],
      );
      equal(await new Response(blob.stream()).text(), "Aé");
      equal(
        await new b.Blob([new Uint8Array([239, 187, 191, 65])]).text(),
        "\ufeffA",
      );
      equal(Array.from(await new b.Blob(["\ud800"]).bytes()), [237, 160, 128]);
      for (const endings of ["transparent", "native", "invalid", null]) {
        error(
          () => new b.Blob([], { endings: endings as any }),
          "Error",
          undefined,
          /not implemented/,
        );
        error(
          () => new b.File([], "x", { endings: endings as any }),
          "Error",
          undefined,
          /not implemented/,
        );
      }
      error(() => new b.Blob(new Set(["a"]) as any), "TypeError");
      equal(new b.File(undefined as any, "x").size, 0);
      for (const date of [-1.9, Infinity, 2 ** 64, NaN])
        check(
          Object.is(
            new b.File([], "x", { lastModified: date }).lastModified,
            Number.isNaN(date) ? 0 : date,
          ),
          "file date",
        );
      equal(new b.File([], "\ud800").name, "���");
      const unusual = new b.Blob(["abcdef"], { type: "A\x7fZ" });
      equal(unusual.type, "a\x7fz");
      equal(await unusual.slice(1.9).text(), "bcdef");
      equal(await unusual.slice(Infinity).text(), "abcdef");
      error(() => unusual.slice(2 ** 31), "TypeError");
      const cloned = structuredClone({ a: unusual, b: unusual });
      check(
        cloned.a === cloned.b && cloned.a instanceof b.Blob,
        "clone identity",
      );
      equal(cloned.a.type, "a\x7fz");
      error(() => structuredClone(file), "DataCloneError");
      const form = new FormData();
      form.append("file", file);
      equal((form.get("file") as globalThis.File).name, "test.txt");
      check(file instanceof b.Blob && file instanceof b.File, "file brands");
      check(
        (await new Response("native").blob()) instanceof b.Blob,
        "native Blob brand",
      );
      equal(Array.from(await blob.bytes()), [65, 195, 169]);
      equal(await blob.slice(-2).text(), "é");
      equal(new b.Blob(["x"], { type: "a\nb" }).type, "");
      error(() => new b.Blob(1 as any), "TypeError");
      error(() => new b.File([], "x", { endings: "invalid" as any }), "Error");
    },
  },
};
export class BufferImplementation extends FeatureImplementation<
  typeof bufferFeature
> {
  constructor() {
    super(
      bufferFeature,
      Object.fromEntries(
        operations.map((name) => [name, { status: "supported" }]),
      ) as Record<(typeof operations)[number], { status: "supported" }>,
    );
  }
  create() {
    return buffer as unknown as Api;
  }
}

const surface = {
  exports: [
    "Blob",
    "Buffer",
    "File",
    "INSPECT_MAX_BYTES",
    "SlowBuffer",
    "atob",
    "btoa",
    "constants",
    "default",
    "isAscii",
    "isUtf8",
    "kMaxLength",
    "kStringMaxLength",
    "resolveObjectURL",
    "transcode",
  ],
  statics: [
    "alloc",
    "allocUnsafe",
    "allocUnsafeSlow",
    "byteLength",
    "compare",
    "concat",
    "from",
    "isBuffer",
    "isEncoding",
    "length",
    "name",
    "of",
    "poolSize",
    "prototype",
  ],
  prototype: [
    "Symbol(kIsBuffer)",
    "Symbol(nodejs.util.inspect.custom)",
    "asciiSlice",
    "asciiWrite",
    "base64Slice",
    "base64Write",
    "base64urlSlice",
    "base64urlWrite",
    "compare",
    "constructor",
    "copy",
    "equals",
    "fill",
    "hexSlice",
    "hexWrite",
    "includes",
    "indexOf",
    "inspect",
    "lastIndexOf",
    "latin1Slice",
    "latin1Write",
    "offset",
    "parent",
    "readBigInt64BE",
    "readBigInt64LE",
    "readBigUInt64BE",
    "readBigUInt64LE",
    "readBigUint64BE",
    "readBigUint64LE",
    "readDoubleBE",
    "readDoubleLE",
    "readFloatBE",
    "readFloatLE",
    "readInt16BE",
    "readInt16LE",
    "readInt32BE",
    "readInt32LE",
    "readInt8",
    "readIntBE",
    "readIntLE",
    "readUInt16BE",
    "readUInt16LE",
    "readUInt32BE",
    "readUInt32LE",
    "readUInt8",
    "readUIntBE",
    "readUIntLE",
    "readUint16BE",
    "readUint16LE",
    "readUint32BE",
    "readUint32LE",
    "readUint8",
    "readUintBE",
    "readUintLE",
    "slice",
    "swap16",
    "swap32",
    "swap64",
    "toJSON",
    "toLocaleString",
    "toString",
    "ucs2Slice",
    "ucs2Write",
    "utf8Slice",
    "utf8Write",
    "write",
    "writeBigInt64BE",
    "writeBigInt64LE",
    "writeBigUInt64BE",
    "writeBigUInt64LE",
    "writeBigUint64BE",
    "writeBigUint64LE",
    "writeDoubleBE",
    "writeDoubleLE",
    "writeFloatBE",
    "writeFloatLE",
    "writeInt16BE",
    "writeInt16LE",
    "writeInt32BE",
    "writeInt32LE",
    "writeInt8",
    "writeIntBE",
    "writeIntLE",
    "writeUInt16BE",
    "writeUInt16LE",
    "writeUInt32BE",
    "writeUInt32LE",
    "writeUInt8",
    "writeUIntBE",
    "writeUIntLE",
    "writeUint16BE",
    "writeUint16LE",
    "writeUint32BE",
    "writeUint32LE",
    "writeUint8",
    "writeUintBE",
    "writeUintLE",
  ],
};

// Captured from workerd 1.20261012.1, compatibility date 2026-10-17.
const transcodeVectors: [
  string,
  string,
  number[],
  number[] | { name: string; message: string },
][] = [
  ["utf8", "utf8", [65, 0, 233, 0], [65, 0, 239, 191, 189, 0]],
  ["utf8", "utf8", [255], [239, 191, 189]],
  ["utf8", "utf8", [192, 175], [239, 191, 189, 239, 191, 189]],
  ["utf8", "utf8", [0, 216], [0, 239, 191, 189]],
  ["utf8", "utf8", [61, 216, 0, 222], [61, 239, 191, 189, 0, 239, 191, 189]],
  ["utf8", "utf8", [239, 187, 191, 65], [239, 187, 191, 65]],
  [
    "utf8",
    "utf16le",
    [65, 0, 233, 0],
    { name: "Error", message: "Unable to transcode buffer" },
  ],
  [
    "utf8",
    "utf16le",
    [255],
    { name: "Error", message: "Unable to transcode buffer" },
  ],
  [
    "utf8",
    "utf16le",
    [192, 175],
    { name: "Error", message: "Unable to transcode buffer" },
  ],
  [
    "utf8",
    "utf16le",
    [0, 216],
    { name: "Error", message: "Unable to transcode buffer" },
  ],
  [
    "utf8",
    "utf16le",
    [61, 216, 0, 222],
    { name: "Error", message: "Unable to transcode buffer" },
  ],
  ["utf8", "utf16le", [239, 187, 191, 65], [255, 254, 65, 0]],
  ["utf8", "latin1", [65, 0, 233, 0], [65, 0, 63, 0]],
  ["utf8", "latin1", [255], [63]],
  ["utf8", "latin1", [192, 175], [63, 63]],
  ["utf8", "latin1", [0, 216], [0, 63]],
  ["utf8", "latin1", [61, 216, 0, 222], [61, 63, 0, 63]],
  ["utf8", "latin1", [239, 187, 191, 65], [65]],
  ["utf8", "ascii", [65, 0, 233, 0], [65, 0, 63, 0]],
  ["utf8", "ascii", [255], [63]],
  ["utf8", "ascii", [192, 175], [63, 63]],
  ["utf8", "ascii", [0, 216], [0, 63]],
  ["utf8", "ascii", [61, 216, 0, 222], [61, 63, 0, 63]],
  ["utf8", "ascii", [239, 187, 191, 65], [65]],
  ["utf16le", "utf8", [65, 0, 233, 0], [65, 195, 169]],
  [
    "utf16le",
    "utf8",
    [255],
    { name: "Error", message: "UTF-16le input size should be multiple of 2" },
  ],
  ["utf16le", "utf8", [192, 175], [234, 191, 128]],
  [
    "utf16le",
    "utf8",
    [0, 216],
    { name: "Error", message: "Expected UTF8 length mismatch" },
  ],
  ["utf16le", "utf8", [61, 216, 0, 222], [240, 159, 152, 128]],
  ["utf16le", "utf8", [239, 187, 191, 65], [235, 175, 175, 228, 134, 191]],
  ["utf16le", "utf16le", [65, 0, 233, 0], [65, 0, 233, 0]],
  ["utf16le", "utf16le", [255], [253, 255]],
  ["utf16le", "utf16le", [192, 175], [192, 175]],
  ["utf16le", "utf16le", [0, 216], [253, 255]],
  ["utf16le", "utf16le", [61, 216, 0, 222], [61, 216, 0, 222]],
  ["utf16le", "utf16le", [239, 187, 191, 65], [239, 187, 191, 65]],
  ["utf16le", "latin1", [65, 0, 233, 0], [65, 233]],
  [
    "utf16le",
    "latin1",
    [255],
    { name: "Error", message: "UTF-16le input size should be multiple of 2" },
  ],
  ["utf16le", "latin1", [192, 175], [63]],
  ["utf16le", "latin1", [0, 216], [63]],
  ["utf16le", "latin1", [61, 216, 0, 222], [63]],
  ["utf16le", "latin1", [239, 187, 191, 65], [63, 63]],
  ["utf16le", "ascii", [65, 0, 233, 0], [65, 233]],
  [
    "utf16le",
    "ascii",
    [255],
    { name: "Error", message: "UTF-16le input size should be multiple of 2" },
  ],
  ["utf16le", "ascii", [192, 175], [63]],
  ["utf16le", "ascii", [0, 216], [63]],
  ["utf16le", "ascii", [61, 216, 0, 222], [63]],
  ["utf16le", "ascii", [239, 187, 191, 65], [63, 63]],
  ["latin1", "utf8", [65, 0, 233, 0], [65, 0, 195, 169, 0]],
  ["latin1", "utf8", [255], [195, 191]],
  ["latin1", "utf8", [192, 175], [195, 128, 194, 175]],
  ["latin1", "utf8", [0, 216], [0, 195, 152]],
  ["latin1", "utf8", [61, 216, 0, 222], [61, 195, 152, 0, 195, 158]],
  ["latin1", "utf8", [239, 187, 191, 65], [195, 175, 194, 187, 194, 191, 65]],
  ["latin1", "utf16le", [65, 0, 233, 0], [65, 0, 0, 0, 233, 0, 0, 0]],
  ["latin1", "utf16le", [255], [255, 0]],
  ["latin1", "utf16le", [192, 175], [192, 0, 175, 0]],
  ["latin1", "utf16le", [0, 216], [0, 0, 216, 0]],
  ["latin1", "utf16le", [61, 216, 0, 222], [61, 0, 216, 0, 0, 0, 222, 0]],
  ["latin1", "utf16le", [239, 187, 191, 65], [239, 0, 187, 0, 191, 0, 65, 0]],
  ["latin1", "latin1", [65, 0, 233, 0], [65, 0, 233, 0]],
  ["latin1", "latin1", [255], [255]],
  ["latin1", "latin1", [192, 175], [192, 175]],
  ["latin1", "latin1", [0, 216], [0, 216]],
  ["latin1", "latin1", [61, 216, 0, 222], [61, 216, 0, 222]],
  ["latin1", "latin1", [239, 187, 191, 65], [239, 187, 191, 65]],
  ["latin1", "ascii", [65, 0, 233, 0], [65, 0, 233, 0]],
  ["latin1", "ascii", [255], [255]],
  ["latin1", "ascii", [192, 175], [192, 175]],
  ["latin1", "ascii", [0, 216], [0, 216]],
  ["latin1", "ascii", [61, 216, 0, 222], [61, 216, 0, 222]],
  ["latin1", "ascii", [239, 187, 191, 65], [239, 187, 191, 65]],
  ["ascii", "utf8", [65, 0, 233, 0], [65, 0, 195, 169, 0]],
  ["ascii", "utf8", [255], [195, 191]],
  ["ascii", "utf8", [192, 175], [195, 128, 194, 175]],
  ["ascii", "utf8", [0, 216], [0, 195, 152]],
  ["ascii", "utf8", [61, 216, 0, 222], [61, 195, 152, 0, 195, 158]],
  ["ascii", "utf8", [239, 187, 191, 65], [195, 175, 194, 187, 194, 191, 65]],
  ["ascii", "utf16le", [65, 0, 233, 0], [65, 0, 0, 0, 233, 0, 0, 0]],
  ["ascii", "utf16le", [255], [255, 0]],
  ["ascii", "utf16le", [192, 175], [192, 0, 175, 0]],
  ["ascii", "utf16le", [0, 216], [0, 0, 216, 0]],
  ["ascii", "utf16le", [61, 216, 0, 222], [61, 0, 216, 0, 0, 0, 222, 0]],
  ["ascii", "utf16le", [239, 187, 191, 65], [239, 0, 187, 0, 191, 0, 65, 0]],
  ["ascii", "latin1", [65, 0, 233, 0], [65, 0, 233, 0]],
  ["ascii", "latin1", [255], [255]],
  ["ascii", "latin1", [192, 175], [192, 175]],
  ["ascii", "latin1", [0, 216], [0, 216]],
  ["ascii", "latin1", [61, 216, 0, 222], [61, 216, 0, 222]],
  ["ascii", "latin1", [239, 187, 191, 65], [239, 187, 191, 65]],
  ["ascii", "ascii", [65, 0, 233, 0], [65, 0, 233, 0]],
  ["ascii", "ascii", [255], [255]],
  ["ascii", "ascii", [192, 175], [192, 175]],
  ["ascii", "ascii", [0, 216], [0, 216]],
  ["ascii", "ascii", [61, 216, 0, 222], [61, 216, 0, 222]],
  ["ascii", "ascii", [239, 187, 191, 65], [239, 187, 191, 65]],
];
