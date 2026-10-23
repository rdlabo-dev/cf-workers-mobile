import { validateCryptoLength } from "./validation.js";
import { secretMaterial, KeyObject } from "./keys.js";
import { Buffer } from "node:buffer";
import { NativeDigest, NativeHmac } from "./native-crypto.js";
export const hashNames = [
  "md4",
  "md5",
  "sha1",
  "sha224",
  "sha256",
  "sha384",
  "sha512",
  "md5-sha1",
  "RSA-MD5",
  "RSA-SHA1",
  "RSA-SHA224",
  "RSA-SHA256",
  "RSA-SHA384",
  "RSA-SHA512",
  "DSA-SHA",
  "DSA-SHA1",
  "ecdsa-with-SHA1",
];
export const aliases: Record<string, string> = Object.assign(
  Object.create(null),
  Object.fromEntries(
    hashNames.map((name) => [
      name.toLowerCase(),
      name
        .toLowerCase()
        .replace(/^rsa-/, "")
        .replace(/^(dsa-sha1?|ecdsa-with-sha1)$/, "sha1"),
    ]),
  ),
);
class HashHandle {
  private hash: NativeDigest;
  private cached?: Buffer;
  constructor(algorithm: string | NativeDigest, length?: number) {
    if (algorithm instanceof NativeDigest) this.hash = algorithm;
    else {
      const normalized = aliases[algorithm.toLowerCase()];
      if (!normalized) throw new Error("Digest method not supported");
      this.hash = new NativeDigest(normalized, "Hash");
    }
    if (length !== undefined && length !== this.hash.size) {
      this.hash.dispose();
      throw new Error("invalid digest size");
    }
  }
  update(data: ArrayBufferView) {
    if (this.cached)
      throw new DOMException(
        "Hash context has already been finalized.",
        "OperationError",
      );
    validateCryptoLength(data.byteLength, "data is too long");
    this.hash.update(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    );
    return 1;
  }
  digest() {
    this.cached ??= Buffer.from(this.hash.final());
    return Buffer.from(this.cached);
  }
  copy(length?: number) {
    if (this.cached)
      throw new DOMException(
        "Hash context has already been finalized.",
        "OperationError",
      );
    return new HashHandle(this.hash.copy(), length);
  }
}
class HmacHandle {
  private hmac: NativeHmac;
  private cached?: Buffer;
  constructor(algorithm: string, key: any) {
    if (typeof CryptoKey !== "undefined" && key instanceof CryptoKey)
      key = KeyObject.from(key);
    key = secretMaterial(key);
    const data = ArrayBuffer.isView(key)
      ? new Uint8Array(key.buffer, key.byteOffset, key.byteLength)
      : new Uint8Array(key);
    validateCryptoLength(data.byteLength, "key is too long");
    const normalized = aliases[algorithm.toLowerCase()];
    if (!normalized) throw new Error("Digest method not supported");
    this.hmac = new NativeHmac(normalized, data);
  }
  update(data: ArrayBufferView) {
    if (this.cached)
      throw new DOMException(
        "HMAC context has already been finalized.",
        "OperationError",
      );
    validateCryptoLength(data.byteLength, "data is too long");
    this.hmac.update(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    );
    return 1;
  }
  digest() {
    this.cached ??= Buffer.from(this.hmac.final());
    return Buffer.from(this.cached);
  }
}
export default { HashHandle, HmacHandle };
