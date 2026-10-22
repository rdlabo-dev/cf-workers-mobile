import { Buffer } from "node:buffer";
import { NativeKey } from "./native-crypto.js";
// DER encodings follow RFC 5208/5915/8410; JWK members follow RFC 7518/8037.
const curves: Record<string, { oid: string; size: number; native: string }> = {
  "P-256": { oid: "2a8648ce3d030107", size: 32, native: "prime256v1" },
  "P-384": { oid: "2b81040022", size: 48, native: "secp384r1" },
  "P-521": { oid: "2b81040023", size: 66, native: "secp521r1" },
  secp256k1: { oid: "2b8104000a", size: 32, native: "secp256k1" },
};
export function der(tag: number, ...parts: Uint8Array[]): Buffer {
  const data = Buffer.concat(parts);
  let length: number[] = [];
  if (data.length < 128) length = [data.length];
  else {
    let size = data.length;
    while (size) {
      length.unshift(size & 255);
      size = Math.floor(size / 256);
    }
    length.unshift(128 + length.length);
  }
  return Buffer.concat([Buffer.from([tag, ...length]), data]);
}
export function integer(bytes: Uint8Array): Buffer {
  let offset = 0;
  while (offset < bytes.length - 1 && bytes[offset] === 0) offset++;
  const data = bytes.subarray(offset);
  return der(2, ...(data[0] & 128 ? [Buffer.from([0]), data] : [data]));
}
function field(jwk: any, name: string, size?: number): Buffer {
  if (typeof jwk[name] !== "string")
    throw new TypeError(`Missing JWK member: ${name}`);
  const bytes = Buffer.from(jwk[name], "base64url");
  if (size !== undefined && bytes.length !== size)
    throw new TypeError(`Invalid JWK member length: ${name}`);
  if (!bytes.length) throw new TypeError(`Empty JWK member: ${name}`);
  return bytes;
}
export function importJwk(jwk: any, privateKey: boolean): NativeKey {
  if (jwk?.kty === "RSA") {
    const names = privateKey
      ? ["n", "e", "d", "p", "q", "dp", "dq", "qi"]
      : ["n", "e"];
    return NativeKey.parse(
      der(
        48,
        ...(privateKey ? [integer(Buffer.from([0]))] : []),
        ...names.map((name) => integer(field(jwk, name))),
      ),
      false,
      privateKey,
    );
  }
  if (jwk?.kty === "EC") {
    const curve = curves[jwk.crv];
    if (!curve) throw new TypeError("Unsupported JWK curve");
    const oid = der(6, Buffer.from(curve.oid, "hex"));
    const point = Buffer.concat([
      Buffer.from([4]),
      field(jwk, "x", curve.size),
      field(jwk, "y", curve.size),
    ]);
    const bits = der(3, Buffer.from([0]), point);
    const data = privateKey
      ? der(
          48,
          integer(Buffer.from([1])),
          der(4, field(jwk, "d", curve.size)),
          der(160, oid),
          der(161, bits),
        )
      : der(
          48,
          der(48, der(6, Buffer.from("2a8648ce3d0201", "hex")), oid),
          bits,
        );
    return NativeKey.parse(data, false, privateKey);
  }
  if (jwk?.kty === "OKP" && ["Ed25519", "X25519"].includes(jwk.crv)) {
    const algorithm = der(
      48,
      der(6, Buffer.from([43, 101, jwk.crv === "Ed25519" ? 112 : 110])),
    );
    const data = privateKey
      ? der(
          48,
          integer(Buffer.from([0])),
          algorithm,
          der(4, der(4, field(jwk, "d", 32))),
        )
      : der(48, algorithm, der(3, Buffer.from([0]), field(jwk, "x", 32)));
    return NativeKey.parse(data, false, privateKey);
  }
  throw new TypeError("Unsupported JWK key type");
}
function encode(bytes: Uint8Array, size?: number): string {
  if (size !== undefined && bytes.length < size)
    bytes = Buffer.concat([Buffer.alloc(size - bytes.length), bytes]);
  return Buffer.from(bytes).toString("base64url");
}
export function exportJwk(key: NativeKey, privateKey: boolean): any {
  if (key.type === "rsa") {
    const result: any = {
      kty: "RSA",
      n: encode(key.parameter("n")),
      e: encode(key.parameter("e")),
    };
    if (privateKey)
      for (const [name, param] of [
        ["d", "d"],
        ["p", "rsa-factor1"],
        ["q", "rsa-factor2"],
        ["dp", "rsa-exponent1"],
        ["dq", "rsa-exponent2"],
        ["qi", "rsa-coefficient1"],
      ])
        result[name] = encode(key.parameter(param));
    return result;
  }
  if (key.type === "ec") {
    const found = Object.entries(curves).find(
      ([, value]) => value.native === key.group,
    );
    if (!found) throw new TypeError("Unsupported JWK curve");
    const [crv, curve] = found;
    return {
      kty: "EC",
      crv,
      x: encode(key.parameter("qx"), curve.size),
      y: encode(key.parameter("qy"), curve.size),
      ...(privateKey ? { d: encode(key.parameter("priv"), curve.size) } : {}),
    };
  }
  if (["ed25519", "x25519"].includes(key.type))
    return {
      kty: "OKP",
      ...(key.type === "ed25519" ? { alg: "EdDSA" } : {}),
      crv: key.type === "ed25519" ? "Ed25519" : "X25519",
      x: encode(key.raw(false)),
      ...(privateKey ? { d: encode(key.raw(true)) } : {}),
    };
  throw new TypeError("Unsupported JWK key type");
}
