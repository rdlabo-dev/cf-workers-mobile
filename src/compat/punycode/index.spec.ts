import punycode, * as namespace from "node:punycode";
import {
  defineFeature,
  FeatureImplementation,
} from "cf-workers-mobile/shared/contracts";
import type { ContractSuite } from "cf-workers-mobile/shared/contracts/testing";
import { testPunycode } from "./upstream.spec";
const groups = [
  "exports",
  "rfcVectors",
  "unicode",
  "domains",
  "errors",
] as const;
export const punycodeFeature = defineFeature<typeof punycode>()(
  "node.punycode",
  groups,
);
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
function failure(fn: () => unknown, name: string, message?: string) {
  try {
    fn();
  } catch (error) {
    equal((error as Error).name, name);
    if (message) equal((error as Error).message, message);
    return;
  }
  throw new Error(`Expected ${name}`);
}
export const punycodeContract: ContractSuite<typeof punycodeFeature> = {
  feature: punycodeFeature,
  cases: {
    exports(api) {
      const names = [
        "decode",
        "encode",
        "toASCII",
        "toUnicode",
        "ucs2",
        "version",
      ];
      equal(Object.keys(api).sort(), names);
      equal(Object.keys(namespace).sort(), [...names, "default"].sort());
      equal(api.version, "2.1.0");
      equal(Object.keys(api.ucs2).sort(), ["decode", "encode"]);
      for (const name of names)
        equal(
          api[name as keyof typeof api] === namespace[name as keyof typeof api],
          true,
        );
    },
    rfcVectors(api) {
      testPunycode.test(api);
    },
    unicode(api) {
      for (const [input, points] of [
        ["", []],
        ["A\u0000", [65, 0]],
        ["😀", [0x1f600]],
        ["\ud800A\udc00", [0xd800, 65, 0xdc00]],
        ["\ud800\ud800\udc00", [0xd800, 0x10000]],
      ] as const) {
        equal(api.ucs2.decode(input), points);
        equal(api.ucs2.encode([...points]), input);
        equal(api.decode(api.encode(input)), input);
      }
      for (let code = 0; code <= 0x10ffff; code += 7919) {
        const text = String.fromCodePoint(code);
        equal(api.ucs2.decode(text), [code]);
        equal(api.ucs2.encode([code]), text);
        equal(api.decode(api.encode(text)), text);
      }
      const points = [65, 0x1f600];
      api.ucs2.encode(points);
      equal(points, [65, 0x1f600]);
    },
    domains(api) {
      equal(api.toASCII("mañana。com"), "xn--maana-pta.com");
      equal(api.toASCII("mañana．com｡"), "xn--maana-pta.com.");
      equal(api.toUnicode("xn--maana-pta.com."), "mañana.com.");
      equal(api.toASCII("a@b@日本語"), "a@b");
      equal(api.toASCII("EXAMPLE.COM"), "EXAMPLE.COM");
      equal(api.toUnicode("XN--MAANA-PTA"), "XN--MAANA-PTA");
      equal(api.toUnicode("xn--MAANA-PTA"), "mañana");
      equal(api.toASCII("a..b"), "a..b");
      equal(api.toASCII("a\u007fb"), "a\u007fb");
    },
    errors(api) {
      failure(() => api.decode(" "), "RangeError", "Invalid input");
      failure(
        () => api.decode("α-"),
        "RangeError",
        "Illegal input >= 0x80 (not a basic code point)",
      );
      failure(() => api.decode("9".repeat(100)), "RangeError");
      for (const value of [-1, 0x110000, 1.5, NaN, Infinity])
        failure(() => api.ucs2.encode([value]), "RangeError");
      for (const value of [undefined, null, 1, {}, Symbol("input")]) {
        failure(() => api.toASCII(value as string), "TypeError");
        failure(() => api.toUnicode(value as string), "TypeError");
      }
    },
  },
};
export class PunycodeImplementation extends FeatureImplementation<
  typeof punycodeFeature
> {
  constructor() {
    super(punycodeFeature, {
      exports: { status: "supported" },
      rfcVectors: { status: "supported" },
      unicode: { status: "supported" },
      domains: { status: "supported" },
      errors: { status: "supported" },
    });
  }
  create() {
    return punycode;
  }
}
