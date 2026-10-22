import { secretMaterial } from "./keys.js";
// RFC 5869 extract-and-expand, using the existing HMAC implementation.
import { Buffer } from "node:buffer";
// @ts-expect-error dependency has no declarations
import original from "crypto-browserify/index.js";
import { bytes, validateInteger } from "./validation.js";
import { validateString, validateFunction } from "../net/validators.js";
import { ERR_OUT_OF_RANGE } from "../net/errors.js";
function parameters(
  digest: string,
  key: unknown,
  salt: unknown,
  info: unknown,
  length: number,
) {
  validateString(digest, "digest");
  const ikm = bytes(secretMaterial(key), "ikm"),
    s = bytes(salt, "salt"),
    i = bytes(info, "info");
  validateInteger(length, "length", 0, 2147483647);
  if (i.byteLength > 1024)
    throw new ERR_OUT_OF_RANGE(
      "info",
      "must not contain more than 1024 bytes",
      i.byteLength,
    );
  return { digest, ikm, s, i, length };
}
function derive({
  digest,
  ikm,
  s,
  i,
  length,
}: ReturnType<typeof parameters>): ArrayBuffer {
  const prk = original.createHmac(digest, s).update(ikm).digest();
  if (length > 255 * prk.length)
    throw Object.assign(new RangeError("Invalid key length"), {
      code: "ERR_CRYPTO_INVALID_KEYLEN",
    });
  const output = Buffer.alloc(length);
  let previous = Buffer.alloc(0);
  try {
    for (let offset = 0, counter = 1; offset < length; counter++) {
      previous = original
        .createHmac(digest, prk)
        .update(previous)
        .update(i)
        .update(Buffer.from([counter]))
        .digest();
      const size = Math.min(previous.length, length - offset);
      output.set(previous.subarray(0, size), offset);
      offset += size;
    }
    return new Uint8Array(output).buffer;
  } finally {
    prk.fill(0);
    previous.fill(0);
  }
}
export function hkdfSync(
  digest: string,
  key: unknown,
  salt: unknown,
  info: unknown,
  length: number,
) {
  return derive(parameters(digest, key, salt, info, length));
}
export function hkdf(
  digest: string,
  key: unknown,
  salt: unknown,
  info: unknown,
  length: number,
  callback: (error: unknown, value?: ArrayBuffer) => void,
) {
  const args = parameters(digest, key, salt, info, length);
  validateFunction(callback, "callback");
  const result = new Promise<ArrayBuffer>((resolve) => resolve(derive(args)));
  result.then(
    (value) => callback(null, value),
    (error) => callback(error),
  );
}
