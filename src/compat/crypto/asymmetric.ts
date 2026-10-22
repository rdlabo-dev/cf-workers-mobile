import { Buffer } from "node:buffer";
import { NativeKey, nativeTimingEqual } from "./native-crypto.js";
import { importJwk } from "./key-formats.js";
import {
  create,
  KeyObject,
  PrivateKeyObject,
  PublicKeyObject,
} from "./keys.js";
import { keyStates } from "./key-state.js";
import { bytes, validateInteger } from "./validation.js";
import {
  validateObject,
  validateString,
  validateOneOf,
  validateFunction,
  validateUint32,
} from "../net/validators.js";
import { ERR_INVALID_ARG_TYPE, ERR_INVALID_ARG_VALUE } from "../net/errors.js";
function handle(key: KeyObject): NativeKey {
  const value = keyStates.get(key)?.asymmetric;
  if (!value)
    throw Object.assign(
      new Error(
        "Synchronous access to opaque host key material is unavailable",
      ),
      { code: "ERR_METHOD_NOT_IMPLEMENTED" },
    );
  return value;
}
function input(value: any, privateKey: boolean): NativeKey {
  if (value == null)
    throw new ERR_INVALID_ARG_TYPE(
      "key",
      ["ArrayBuffer", "Buffer", "TypedArray", "DataView", "string", "object"],
      value,
    );
  const options =
    typeof value === "string" ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
      ? { key: value }
      : value;
  const data = options.key;
  if (
    data == null ||
    data instanceof KeyObject ||
    data instanceof globalThis.CryptoKey
  )
    throw new ERR_INVALID_ARG_TYPE(
      "options.key",
      ["ArrayBuffer", "Buffer", "TypedArray", "DataView", "string", "object"],
      data,
    );
  if (
    typeof data === "object" &&
    !(data instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(data)
  )
    return importJwk(data, privateKey);
  const format = options.format ?? "pem";
  validateOneOf(format, "format", ["pem", "der"]);
  if (options.type !== undefined)
    validateOneOf(
      options.type,
      "type",
      privateKey ? ["pkcs1", "pkcs8", "sec1"] : ["pkcs1", "spki"],
    );
  const raw =
    typeof data === "string"
      ? Buffer.from(data, options.encoding ?? "utf8")
      : bytes(data, "key");
  const password =
    options.passphrase === undefined
      ? undefined
      : typeof options.passphrase === "string"
        ? Buffer.from(options.passphrase, options.encoding ?? "utf8")
        : bytes(options.passphrase, "passphrase");
  if (privateKey) return NativeKey.parse(raw, format === "pem", true, password);
  try {
    return NativeKey.parse(raw, format === "pem", false, password);
  } catch (error) {
    // createPublicKey also accepts a serialized private key, deriving public material.
    let key: NativeKey;
    try {
      key = NativeKey.parse(raw, format === "pem", true, password);
    } catch {
      throw error;
    }
    try {
      return NativeKey.parse(key.export(false, false, "spki"), false, false);
    } finally {
      key.dispose();
    }
  }
}
export function createPrivateKey(value: unknown): PrivateKeyObject {
  return create("private", {
    asymmetric: input(value, true),
  }) as PrivateKeyObject;
}
export function createPublicKey(value: any): PublicKeyObject {
  if (keyStates.has(value)) {
    if (value.type !== "private")
      throw new ERR_INVALID_ARG_TYPE("key", "PrivateKeyObject", value);
    return create("public", {
      asymmetric: NativeKey.parse(
        handle(value).export(false, false, "spki"),
        false,
        false,
      ),
    }) as PublicKeyObject;
  }
  return create("public", {
    asymmetric: input(value, false),
  }) as PublicKeyObject;
}
export function generateKeyPairSync(type: string, options: any = {}) {
  validateOneOf(type, "type", ["rsa", "ec", "ed25519", "x25519", "dh"]);
  validateObject(options, "options");
  let key: NativeKey;
  if (type === "rsa") {
    validateUint32(options.modulusLength, "options.modulusLength");
    validateUint32(options.publicExponent ?? 65537, "options.publicExponent");
    key = NativeKey.generate(
      "RSA",
      options.modulusLength,
      undefined,
      options.publicExponent ?? 65537,
    );
  } else if (type === "ec") {
    validateString(options.namedCurve, "options.namedCurve");
    validateOneOf(options.paramEncoding ?? "named", "options.paramEncoding", [
      "named",
      "explicit",
    ]);
    key = NativeKey.generate("EC", 0, options.namedCurve);
  } else if (type === "dh") {
    const groups: Record<string, string> = {
      modp1: "modp_768",
      modp2: "modp_1024",
      modp5: "modp_1536",
      modp14: "modp_2048",
      modp15: "modp_3072",
      modp16: "modp_4096",
      modp17: "modp_6144",
      modp18: "modp_8192",
    };
    const group = options.group ?? options.groupName;
    validateString(group, "options.group");
    key = NativeKey.generate("DH", 0, groups[group] ?? group);
  } else key = NativeKey.generate(type.toUpperCase());
  const privateKey = create("private", { asymmetric: key }) as PrivateKeyObject;
  const publicKey = createPublicKey(privateKey);
  return {
    publicKey: options.publicKeyEncoding
      ? publicKey.export(options.publicKeyEncoding)
      : publicKey,
    privateKey: options.privateKeyEncoding
      ? privateKey.export(options.privateKeyEncoding)
      : privateKey,
  };
}
export function generateKeyPair(
  type: string,
  options: any,
  callback: any,
): void {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  validateFunction(callback, "callback");
  let result: ReturnType<typeof generateKeyPairSync> | undefined,
    failure: unknown;
  try {
    result = generateKeyPairSync(type, options);
  } catch (error) {
    failure = error;
  }
  queueMicrotask(() =>
    failure
      ? callback(failure)
      : callback(null, result!.publicKey, result!.privateKey),
  );
}
function optionsOf(value: any) {
  return value &&
    typeof value === "object" &&
    !keyStates.has(value) &&
    "key" in value
    ? value
    : { key: value };
}
function operationKey(value: any, privateKey: boolean): KeyObject {
  const key = optionsOf(value).key;
  if (keyStates.has(key)) {
    if (key.type === "secret" || (privateKey && key.type !== "private"))
      throw new TypeError("Invalid key type");
    return key;
  }
  return privateKey ? createPrivateKey(value) : createPublicKey(value);
}
function digestName(algorithm: any): string | null {
  if (algorithm == null) return null;
  validateString(algorithm, "algorithm");
  return algorithm;
}
export function sign(
  algorithm: any,
  data: unknown,
  key: any,
  callback?: any,
): any {
  if (callback !== undefined) validateFunction(callback, "callback");
  const digest = digestName(algorithm),
    raw = bytes(data, "data");
  const execute = () => {
    const options = optionsOf(key);
    return Buffer.from(
      handle(operationKey(key, true)).sign(
        digest,
        raw,
        options.padding ?? 0,
        options.saltLength ?? -1,
        options.dsaEncoding === "ieee-p1363",
      ),
    );
  };
  if (callback === undefined) return execute();
  let result: Buffer | undefined, failure: unknown;
  try {
    result = execute();
  } catch (error) {
    failure = error;
  }
  queueMicrotask(() => callback(failure ?? null, result));
}
export function verify(
  algorithm: any,
  data: unknown,
  key: any,
  signature: unknown,
  callback?: any,
): any {
  if (callback !== undefined) validateFunction(callback, "callback");
  const digest = digestName(algorithm),
    raw = bytes(data, "data"),
    sig = bytes(signature, "signature");
  const execute = () => {
    const options = optionsOf(key);
    return handle(operationKey(key, false)).verify(
      digest,
      raw,
      sig,
      options.padding ?? 0,
      options.saltLength ?? -1,
      options.dsaEncoding === "ieee-p1363",
    );
  };
  if (callback === undefined) return execute();
  let result: boolean | undefined, failure: unknown;
  try {
    result = execute();
  } catch (error) {
    failure = error;
  }
  queueMicrotask(() => callback(failure ?? null, result));
}
export function diffieHellman(options: any): Buffer {
  validateObject(options, "options");
  const { publicKey, privateKey } = options;
  if (!keyStates.has(publicKey))
    throw new ERR_INVALID_ARG_TYPE("options.publicKey", "KeyObject", publicKey);
  if (!keyStates.has(privateKey))
    throw new ERR_INVALID_ARG_TYPE(
      "options.privateKey",
      "KeyObject",
      privateKey,
    );
  if (publicKey.type !== "public")
    throw new ERR_INVALID_ARG_TYPE(
      "options.publicKey",
      "public key",
      publicKey,
    );
  if (privateKey.type !== "private")
    throw new ERR_INVALID_ARG_TYPE(
      "options.privateKey",
      "private key",
      privateKey,
    );
  if (publicKey.asymmetricKeyType !== privateKey.asymmetricKeyType)
    throw new ERR_INVALID_ARG_VALUE(
      "options.publicKey.asymmetricKeyType",
      publicKey.asymmetricKeyType,
      "must equal privateKey.asymmetricKeyType",
    );
  const publicHandle = handle(publicKey),
    privateHandle = handle(privateKey);

  // The pinned workerd crypto-keys.c++ passes the public key as the first
  // DHPointer::stateless argument. Preserve its observable failure rather than
  // silently substituting standalone Node behavior.
  try {
    return Buffer.from(publicHandle.derive(privateHandle));
  } catch {
    throw new Error("Failed to derive shared diffie-hellman secret");
  }
}
export function timingSafeEqual(a: unknown, b: unknown): boolean {
  if (!(a instanceof ArrayBuffer) && !ArrayBuffer.isView(a))
    throw new ERR_INVALID_ARG_TYPE(
      "buf1",
      ["ArrayBuffer", "Buffer", "TypedArray", "DataView"],
      a,
    );
  if (!(b instanceof ArrayBuffer) && !ArrayBuffer.isView(b))
    throw new ERR_INVALID_ARG_TYPE(
      "buf2",
      ["ArrayBuffer", "Buffer", "TypedArray", "DataView"],
      b,
    );
  const left = bytes(a, "buf1"),
    right = bytes(b, "buf2");
  if (left.length !== right.length)
    throw Object.assign(
      new RangeError("Input buffers must have the same byte length"),
      { code: "ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH" },
    );
  return nativeTimingEqual(left, right);
}
