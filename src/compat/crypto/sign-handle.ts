import { Buffer } from "node:buffer";
import { NativeDigest } from "./native-crypto.js";
import { keyStates } from "./key-state.js";
import { KeyObject } from "./keys.js";
import { sign, verify } from "./asymmetric.js";
import { der, integer } from "./key-formats.js";
function key(value: any) {
  if (value instanceof globalThis.CryptoKey) value = KeyObject.from(value);
  const result = keyStates.get(value)?.asymmetric;
  if (!result)
    throw Object.assign(
      new Error(
        "Synchronous access to opaque host key material is unavailable",
      ),
      { code: "ERR_METHOD_NOT_IMPLEMENTED" },
    );
  return result;
}
function rawSignature(data: Uint8Array, width: number): Buffer {
  let offset = 0;
  const item = (tag: number) => {
    if (data[offset++] !== tag) throw new Error("Invalid DER signature");
    let length = data[offset++];
    if (length & 128) {
      const count = length & 127;
      length = 0;
      for (let i = 0; i < count; i++) length = length * 256 + data[offset++];
    }
    if (offset + length > data.length) throw new Error("Invalid DER signature");
    return length;
  };
  const length = item(48);
  if (offset + length !== data.length) throw new Error("Invalid DER signature");
  const output = Buffer.alloc(width * 2);
  for (let part = 0; part < 2; part++) {
    let length = item(2);
    while (length > width && data[offset] === 0) {
      offset++;
      length--;
    }
    if (length > width) throw new Error("Invalid DER signature");
    output.set(
      data.subarray(offset, offset + length),
      part * width + width - length,
    );
    offset += length;
  }
  return output;
}
class SignHandle {
  private hash: NativeDigest;
  constructor(private algorithm: string) {
    this.hash = new NativeDigest(algorithm);
  }
  update(data: Uint8Array) {
    this.hash.update(
      Buffer.from(data.buffer, data.byteOffset, data.byteLength),
    );
  }
  sign(value: any, padding?: number, saltLength?: number, encoding?: number) {
    const native = key(value),
      signed = native.signHash(
        this.algorithm,
        this.hash.final(),
        padding,
        saltLength,
      );
    return encoding === 1 && native.type === "ec"
      ? rawSignature(signed, Math.ceil(native.bits / 8))
      : signed;
  }
}
class VerifyHandle {
  private hash: NativeDigest;
  constructor(private algorithm: string) {
    this.hash = new NativeDigest(algorithm, "Verification");
  }
  update(data: Uint8Array) {
    this.hash.update(
      Buffer.from(data.buffer, data.byteOffset, data.byteLength),
    );
  }
  verify(
    value: any,
    signature: Uint8Array,
    padding?: number,
    saltLength?: number,
    encoding?: number,
  ) {
    const native = key(value),
      hash = this.hash.final();
    if (encoding === 1 && native.type === "ec") {
      const width = Math.ceil(native.bits / 8);
      if (signature.length !== width * 2) return false;
      signature = der(
        48,
        integer(signature.subarray(0, width)),
        integer(signature.subarray(width)),
      );
    }
    return native.verifyHash(
      this.algorithm,
      hash,
      signature,
      padding,
      saltLength,
    );
  }
}
export default {
  SignHandle,
  VerifyHandle,
  signOneShot(
    key: any,
    algorithm: any,
    data: any,
    padding?: number,
    saltLength?: number,
    encoding?: number,
  ) {
    return sign(algorithm, data, {
      key,
      padding,
      saltLength,
      dsaEncoding: encoding === 1 ? "ieee-p1363" : "der",
    });
  },
  verifyOneShot(
    key: any,
    algorithm: any,
    data: any,
    signature: any,
    padding?: number,
    saltLength?: number,
    encoding?: number,
  ) {
    return verify(
      algorithm,
      data,
      {
        key,
        padding,
        saltLength,
        dsaEncoding: encoding === 1 ? "ieee-p1363" : "der",
      },
      signature,
    );
  },
};
