import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/workers-capacitor/features";
import type { ContractSuite } from "@rdlabo/workers-capacitor/testing";
// @ts-expect-error Workers exposes this internal module without Node typings.
import * as actual from "node:_tls_common";
const api = actual as typeof import("./index.js");
function same(a: unknown, b: unknown) {
  if (a !== b) throw Error(`${String(a)} != ${String(b)}`);
}
function equal(a: unknown, b: unknown) {
  same(JSON.stringify(a), JSON.stringify(b));
}
function rejects(fn: () => unknown, code?: string) {
  try {
    fn();
  } catch (error) {
    if (code) same((error as { code: string }).code, code);
    return;
  }
  throw Error("Expected rejection");
}
export const tlsCommonFeature = defineFeature<typeof api>()(
  "node._tls_common",
  [
    "surface",
    "construction",
    "options",
    "validation",
    "empty",
    "certificate",
    "issuer",
    "malformed",
  ],
);
export const tlsCommonContract: ContractSuite<typeof tlsCommonFeature> = {
  feature: tlsCommonFeature,
  cases: {
    surface(api) {
      const names = [
        "SecureContext",
        "createSecureContext",
        "translatePeerCertificate",
      ];
      equal(Object.keys(api).sort(), [...names, "default"].sort());
      equal(Object.keys(api.default).sort(), names.sort());
      for (const name of names)
        same((api as any)[name], (api.default as any)[name]);
    },
    construction(api) {
      for (const value of [
        new api.SecureContext(),
        (api.SecureContext as any)(),
        api.createSecureContext(),
      ]) {
        same(value instanceof api.SecureContext, true);
        equal(Object.keys(value), ["context"]);
        same(value.context, undefined);
        same(Object.getPrototypeOf(value), api.SecureContext.prototype);
      }
      equal(Object.getOwnPropertyNames(api.SecureContext.prototype), [
        "constructor",
      ]);
    },
    options(api) {
      const order: string[] = [];
      const options = Object.fromEntries(
        ["secureProtocol", "secureOptions", "minVersion", "maxVersion"].map(
          (name) => [name, undefined],
        ),
      );
      for (const name of Object.keys(options))
        Object.defineProperty(options, name, {
          get() {
            order.push(name);
            return name === "secureOptions" ? 1 : { ignored: true };
          },
        });
      same(api.createSecureContext(options).context, undefined);
      equal(order, [
        "secureProtocol",
        "secureOptions",
        "minVersion",
        "maxVersion",
      ]);
      same(
        api.createSecureContext({
          key: "ignored",
          cert: "ignored",
          ca: "ignored",
        }).context,
        undefined,
      );
    },
    validation(api) {
      for (const value of [null, "1", {}, true])
        rejects(
          () => new api.SecureContext(undefined, value as never),
          "ERR_INVALID_ARG_TYPE",
        );
      for (const value of [1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
        rejects(
          () => new api.SecureContext(undefined, value),
          "ERR_OUT_OF_RANGE",
        );
      for (const value of [-1, 0, Number.MAX_SAFE_INTEGER])
        same(new api.SecureContext(undefined, value).context, undefined);
      rejects(() => api.createSecureContext(null as never));
    },
    empty(api) {
      for (const value of [undefined, null, false, 0, ""])
        same(api.translatePeerCertificate(value as never), null);
      const value = {};
      same(api.translatePeerCertificate(value as never), value);
    },
    certificate(api) {
      const value: any = {
        infoAccess:
          'OCSP - URI:http://one\nOCSP - URI:"https://two"\nCA Issuers - URI:http://ca\n',
        untouched: 3,
      };
      same(api.translatePeerCertificate(value), value);
      same(Object.getPrototypeOf(value.infoAccess), null);
      equal(value.infoAccess, {
        "OCSP - URI": ["http://one", "https://two"],
        "CA Issuers - URI": ["http://ca"],
      });
      same(value.untouched, 3);
    },
    issuer(api) {
      const root: any = { infoAccess: "ROOT:value" };
      root.issuerCertificate = root;
      const leaf: any = { issuerCertificate: root, infoAccess: "LEAF:value" };
      same(api.translatePeerCertificate(leaf), leaf);
      same(leaf.issuerCertificate, root);
      same(root.issuerCertificate, root);
      equal(root.infoAccess.ROOT, ["value"]);
      equal(leaf.infoAccess.LEAF, ["value"]);
    },
    malformed(api) {
      for (const infoAccess of [{}, 'KEY:"unterminated']) {
        const value: any = { infoAccess };
        rejects(() => api.translatePeerCertificate(value));
        same(Object.getPrototypeOf(value.infoAccess), null);
      }
    },
  },
};
export class TlsCommonImplementation extends FeatureImplementation<
  typeof tlsCommonFeature
> {
  constructor(private readonly implementation = api) {
    super(tlsCommonFeature, {
      surface: { status: "supported" },
      construction: { status: "supported" },
      options: { status: "supported" },
      validation: { status: "supported" },
      empty: { status: "supported" },
      certificate: { status: "supported" },
      issuer: { status: "supported" },
      malformed: { status: "supported" },
    });
  }
  create() {
    return this.implementation;
  }
}
