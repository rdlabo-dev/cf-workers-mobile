import * as dh from "./dh.js";
export * from "./dh.js";
import { pbkdf2, pbkdf2Sync } from "./pbkdf2.js";
export { pbkdf2, pbkdf2Sync };
import { Hash, Hmac, createHmac, createHash, hash } from "./hash.js";
export { Hash, Hmac, createHmac, createHash, hash };
import { X509Certificate } from "./x509.js";
export { X509Certificate };
import { Certificate } from "./certificate.js";
export { Certificate };
import { ECDH, createECDH } from "./ecdh.js";
export { ECDH, createECDH };
import * as signatures from "./signatures.js";
export * from "./signatures.js";
import * as prime from "./prime.js";
export * from "./prime.js";
import * as asymmetric from "./asymmetric.js";
export {
  createPrivateKey,
  createPublicKey,
  generateKeyPair,
  generateKeyPairSync,
  diffieHellman,
  timingSafeEqual,
} from "./asymmetric.js";
import * as keys from "./keys.js";
export {
  KeyObject,
  SecretKeyObject,
  PublicKeyObject,
  PrivateKeyObject,
  createSecretKey,
  generateKey,
  generateKeySync,
} from "./keys.js";
import * as metadata from "./metadata.js";
export * from "./metadata.js";
// Existing algorithms retain the dependency implementation. Additional APIs
// below are separately verified against the pinned Workers profile.
// @ts-expect-error crypto-browserify has no declarations
import original from "crypto-browserify/index.js";
const originalSupported = { ...original };
for (const name of ["prng", "rng", "listCiphers", "createCredentials"])
  delete originalSupported[name];
import { hkdf, hkdfSync } from "./hkdf.js";
import {
  randomInt,
  randomUUID,
  randomBytes,
  randomFill,
  randomFillSync,
} from "./random.js";
export { randomBytes, randomFill, randomFillSync };
export const pseudoRandomBytes = randomBytes;
import { scrypt, scryptSync } from "./scrypt.js";
export { hkdf, hkdfSync, randomInt, randomUUID, scrypt, scryptSync };
import { constants } from "./constants.js";
export { constants };
import {
  Cipheriv,
  Decipheriv,
  createCipheriv,
  createDecipheriv,
} from "./symmetric.js";
export { Cipheriv, Decipheriv, createCipheriv, createDecipheriv };
import {
  publicEncrypt,
  privateEncrypt,
  publicDecrypt,
  privateDecrypt,
} from "./rsa.js";
export { publicEncrypt, privateEncrypt, publicDecrypt, privateDecrypt };
import { webcrypto, subtle } from "./webcrypto.js";
export { webcrypto, subtle };
export const getRandomValues = webcrypto.getRandomValues.bind(webcrypto);
export const CryptoKey = globalThis.CryptoKey;
export default {
  X509Certificate,
  Certificate,
  ...originalSupported,
  ...dh,
  constants,
  pbkdf2,
  pbkdf2Sync,
  Hash,
  createHash,
  ...metadata,
  ...asymmetric,
  ...signatures,
  ...prime,
  publicEncrypt,
  privateEncrypt,
  publicDecrypt,
  privateDecrypt,
  ECDH,
  createECDH,
  KeyObject: keys.KeyObject,
  SecretKeyObject: keys.SecretKeyObject,
  PublicKeyObject: keys.PublicKeyObject,
  PrivateKeyObject: keys.PrivateKeyObject,
  createSecretKey: keys.createSecretKey,
  generateKey: keys.generateKey,
  generateKeySync: keys.generateKeySync,
  Hmac,
  createHmac,
  Cipheriv,
  createCipheriv,
  Decipheriv,
  createDecipheriv,
  hkdf,
  hkdfSync,
  webcrypto,
  subtle,
  getRandomValues,
  CryptoKey,
  randomInt,
  randomUUID,
  pseudoRandomBytes,
  randomBytes,
  randomFill,
  randomFillSync,
  hash,
  scrypt,
  scryptSync,
};
