// @ts-nocheck
// Pinned workerd crypto_cipher.ts; LICENSE-APACHE and LICENSE-3RD-PARTY.md.
import { Buffer } from "node:buffer";
import { validateNumber, validateString } from "../net/validators.js";
import { ERR_INVALID_ARG_TYPE, ERR_MISSING_ARGS } from "../net/errors.js";
import { ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE } from "./sign-errors.js";
import { isAnyArrayBuffer, isArrayBufferView } from "../util/types/index.js";
import { isKeyObject, getKeyObjectHandle } from "./keys.js";
import { createPrivateKey, createPublicKey } from "./asymmetric.js";
import { keyStates } from "./key-state.js";
const kRsaPkcs1Padding = 1;
function operate(operation, key, data, options) {
  const handle = keyStates.get(key)?.asymmetric;
  if (!handle)
    throw Object.assign(
      new Error(
        "Synchronous access to opaque host key material is unavailable",
      ),
      { code: "ERR_METHOD_NOT_IMPLEMENTED" },
    );
  if (data instanceof ArrayBuffer) data = new Uint8Array(data);
  return handle.rsa(operation, data, options);
}
const cryptoImpl = {
  publicEncrypt: (...args) => operate(0, ...args),
  privateDecrypt: (...args) => operate(1, ...args),
  privateEncrypt: (...args) => operate(2, ...args),
  publicDecrypt: (...args) => operate(3, ...args),
};
function getPaddingAndHash(options: HashOptions): PublicPrivateCipherOptions {
  const {
    padding = kRsaPkcs1Padding,
    oaepHash = "sha256",
    oaepLabel,
    encoding = "utf8",
  } = options;

  validateNumber(padding, "options.padding");
  validateString(oaepHash, "options.oaepHash");

  let label: ArrayBufferView | ArrayBuffer | undefined;
  if (oaepLabel !== undefined) {
    if (typeof oaepLabel === "string") {
      label = Buffer.from(oaepLabel, encoding);
    } else if (isAnyArrayBuffer(oaepLabel) || isArrayBufferView(oaepLabel)) {
      label = oaepLabel;
    } else {
      throw new ERR_INVALID_ARG_TYPE(
        "options.oaepLabel",
        ["string", "Buffer", "TypedArray", "DataView", "ArrayBuffer"],
        oaepLabel,
      );
    }
  }

  return { padding, oaepHash, oaepLabel: label };
}

export function privateEncrypt(
  privateKey: CreateAsymmetricKeyOptions | KeyObject | CryptoKey | undefined,
  buffer: string | ArrayBufferView | ArrayBuffer | undefined,
): Buffer {
  if (privateKey === undefined) {
    throw new ERR_MISSING_ARGS("privateKey");
  }
  if (buffer === undefined) {
    throw new ERR_MISSING_ARGS("buffer");
  }
  const key = ((): CryptoKey => {
    if (privateKey instanceof CryptoKey) {
      if (privateKey.type !== "private") {
        throw new ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE(
          privateKey.type,
          "private",
        );
      }
      return privateKey;
    } else if (isKeyObject(privateKey)) {
      if (privateKey.type !== "private") {
        throw new ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE(
          privateKey.type,
          "private",
        );
      }
      return getKeyObjectHandle(privateKey);
    } else {
      const pvtKey = createPrivateKey(privateKey);
      return getKeyObjectHandle(pvtKey);
    }
  })();
  if (typeof buffer === "string") {
    const { encoding = "utf8" } = privateKey as { encoding?: string };
    buffer = Buffer.from(buffer, encoding);
  }

  return Buffer.from(
    cryptoImpl.privateEncrypt(
      key,
      buffer,
      getPaddingAndHash(privateKey as HashOptions),
    ),
  );
}

export function privateDecrypt(
  privateKey: CreateAsymmetricKeyOptions | KeyData,
  buffer: string | ArrayBufferView | ArrayBuffer,
): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (privateKey === undefined) {
    throw new ERR_MISSING_ARGS("privateKey");
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (buffer === undefined) {
    throw new ERR_MISSING_ARGS("buffer");
  }
  const key = ((): CryptoKey => {
    if (privateKey instanceof CryptoKey) {
      if (privateKey.type !== "private") {
        throw new ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE(
          privateKey.type,
          "private",
        );
      }
      return privateKey;
    } else if (isKeyObject(privateKey)) {
      if (privateKey.type !== "private") {
        throw new ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE(
          privateKey.type,
          "private",
        );
      }
      return getKeyObjectHandle(privateKey);
    } else {
      const pvtKey = createPrivateKey(privateKey as CreateAsymmetricKeyOptions);
      return getKeyObjectHandle(pvtKey);
    }
  })();
  if (typeof buffer === "string") {
    const { encoding = "utf8" } = privateKey as { encoding?: string };
    buffer = Buffer.from(buffer, encoding);
  }

  return Buffer.from(
    cryptoImpl.privateDecrypt(
      key,
      buffer,
      getPaddingAndHash(privateKey as HashOptions),
    ),
  );
}

export function publicEncrypt(
  key: CreateAsymmetricKeyOptions | KeyData,
  buffer: string | ArrayBufferView | ArrayBuffer,
): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (key === undefined) {
    throw new ERR_MISSING_ARGS("key");
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (buffer === undefined) {
    throw new ERR_MISSING_ARGS("buffer");
  }
  const pkey = ((): CryptoKey => {
    if (key instanceof CryptoKey) {
      if (key.type !== "public") {
        throw new ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE(key.type, "public");
      }
      return key;
    } else if (isKeyObject(key)) {
      if (key.type !== "public") {
        throw new ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE(key.type, "public");
      }
      return getKeyObjectHandle(key);
    } else {
      const pubKey = createPublicKey(key as CreateAsymmetricKeyOptions);
      return getKeyObjectHandle(pubKey);
    }
  })();
  if (typeof buffer === "string") {
    const { encoding = "utf8" } = key as { encoding?: string };
    buffer = Buffer.from(buffer, encoding);
  }

  return Buffer.from(
    cryptoImpl.publicEncrypt(
      pkey,
      buffer,
      getPaddingAndHash(key as HashOptions),
    ),
  );
}

export function publicDecrypt(
  key: CreateAsymmetricKeyOptions | KeyData,
  buffer: string | ArrayBufferView | ArrayBuffer,
): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (key === undefined) {
    throw new ERR_MISSING_ARGS("key");
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (buffer === undefined) {
    throw new ERR_MISSING_ARGS("buffer");
  }
  const pkey = ((): CryptoKey => {
    if (key instanceof CryptoKey) {
      if (key.type !== "public") {
        throw new ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE(key.type, "public");
      }
      return key;
    } else if (isKeyObject(key)) {
      if (key.type !== "public") {
        throw new ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE(key.type, "public");
      }
      return getKeyObjectHandle(key);
    } else {
      const pubKey = createPublicKey(key as CreateAsymmetricKeyOptions);
      return getKeyObjectHandle(pubKey);
    }
  })();
  if (typeof buffer === "string") {
    const { encoding = "utf8" } = key as { encoding?: string };
    buffer = Buffer.from(buffer, encoding);
  }

  return Buffer.from(
    cryptoImpl.publicDecrypt(
      pkey,
      buffer,
      getPaddingAndHash(key as HashOptions),
    ),
  );
}
