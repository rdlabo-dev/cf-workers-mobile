// Brand checks needed by Workers deep comparisons. Calling intrinsic methods
// reads internal slots without invoking user-defined toStringTag getters.
function accepts(method: Function, value: unknown): boolean {
  try {
    Reflect.apply(method, value, []);
    return true;
  } catch {
    return false;
  }
}
const getter = (prototype: object, name: PropertyKey) =>
  Object.getOwnPropertyDescriptor(prototype, name)!.get!;
const arrayBufferLength = getter(ArrayBuffer.prototype, "byteLength");
const sharedArrayBufferLength =
  typeof SharedArrayBuffer === "undefined"
    ? undefined
    : getter(SharedArrayBuffer.prototype, "byteLength");
const mapSize = getter(Map.prototype, "size");
const setSize = getter(Set.prototype, "size");
const regexpGlobal = getter(RegExp.prototype, "global");
const nativeErrorCheck = (
  Error as ErrorConstructor & { isError(value: unknown): boolean }
).isError;
const dateValue = Date.prototype.getTime;
const numberValue = Number.prototype.valueOf;
const stringValue = String.prototype.valueOf;
const booleanValue = Boolean.prototype.valueOf;
const bigIntValue = BigInt.prototype.valueOf;
const symbolValue = Symbol.prototype.valueOf;
const typedArrayName = getter(
  Object.getPrototypeOf(Uint8Array.prototype),
  Symbol.toStringTag,
);
export const isAnyArrayBuffer = (value: unknown) =>
  accepts(arrayBufferLength, value) ||
  (sharedArrayBufferLength !== undefined &&
    accepts(sharedArrayBufferLength, value));
export const isArrayBufferView = ArrayBuffer.isView;
export const isDate = (value: unknown) => accepts(dateValue, value);
export const isMap = (value: unknown) => accepts(mapSize, value);
export const isSet = (value: unknown) => accepts(setSize, value);
export const isRegExp = (value: unknown) =>
  accepts(regexpGlobal, value) &&
  typeof Reflect.apply(regexpGlobal, value, []) === "boolean";
export const isNativeError = (value: unknown) => nativeErrorCheck(value);
export const isNumberObject = (value: unknown) =>
  typeof value === "object" && value !== null && accepts(numberValue, value);
export const isStringObject = (value: unknown) =>
  typeof value === "object" && value !== null && accepts(stringValue, value);
export const isBooleanObject = (value: unknown) =>
  typeof value === "object" && value !== null && accepts(booleanValue, value);
export const isBigIntObject = (value: unknown) =>
  typeof value === "object" && value !== null && accepts(bigIntValue, value);
export const isSymbolObject = (value: unknown) =>
  typeof value === "object" && value !== null && accepts(symbolValue, value);
export const isBoxedPrimitive = (value: unknown) =>
  isNumberObject(value) ||
  isStringObject(value) ||
  isBooleanObject(value) ||
  isBigIntObject(value) ||
  isSymbolObject(value);
export const isFloat16Array = (value: unknown) =>
  Reflect.apply(typedArrayName, value, []) === "Float16Array";
export const isFloat32Array = (value: unknown) =>
  Reflect.apply(typedArrayName, value, []) === "Float32Array";
export const isFloat64Array = (value: unknown) =>
  Reflect.apply(typedArrayName, value, []) === "Float64Array";
