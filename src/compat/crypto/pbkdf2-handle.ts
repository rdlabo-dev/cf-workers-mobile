import { validateCryptoLength } from "./validation.js";
import { nativePbkdf2 } from "./native-crypto.js";
import { aliases } from "./hash-handle.js";
const sizes: Record<string, number> = {
  md4: 16,
  md5: 16,
  sha1: 20,
  sha224: 28,
  sha256: 32,
  sha384: 48,
  sha512: 64,
  "md5-sha1": 36,
};
export default {
  getPbkdf(
    password: Uint8Array,
    salt: Uint8Array,
    iterations: number,
    length: number,
    digest: string,
  ) {
    const normalized = aliases[digest.toLowerCase()];
    if (!normalized) throw new TypeError("Invalid Pbkdf2 digest: " + digest);
    validateCryptoLength(
      password.byteLength,
      "Pbkdf2 failed: password is too large",
    );
    validateCryptoLength(salt.byteLength, "Pbkdf2 failed: salt is too large");
    if (length > 255 * sizes[normalized])
      throw new RangeError(
        "Pbkdf2 failed: derived key length exceeds maximum for this hash",
      );
    return nativePbkdf2(password, salt, iterations, length, normalized);
  },
};
