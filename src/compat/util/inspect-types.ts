export {
  isAnyArrayBuffer,
  isArrayBufferView,
  isDate,
  isMap,
  isSet,
  isRegExp,
  isNativeError,
  isBoxedPrimitive,
  isNumberObject,
  isStringObject,
  isBooleanObject,
  isBigIntObject,
} from "./comparison-types.js";
// These inspection fallbacks do not constitute native node:util/types support.
// Engine-only brands, Proxy targets and Promise state remain separate gaps.
const tag = (value: unknown) => Object.prototype.toString.call(value);
export const isAsyncFunction = (value: unknown) =>
  ["[object AsyncFunction]", "[object AsyncGeneratorFunction]"].includes(
    tag(value),
  );
export const isGeneratorFunction = (value: unknown) =>
  ["[object GeneratorFunction]", "[object AsyncGeneratorFunction]"].includes(
    tag(value),
  );
export const isArgumentsObject = (value: unknown) =>
  tag(value) === "[object Arguments]";
export const isMapIterator = (value: unknown) =>
  tag(value) === "[object Map Iterator]";
export const isSetIterator = (value: unknown) =>
  tag(value) === "[object Set Iterator]";
export const isPromise = (value: unknown) => tag(value) === "[object Promise]";
export const isModuleNamespaceObject = (value: unknown) =>
  tag(value) === "[object Module]";
const arrayBufferLength = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength",
)!.get!;
const dataViewBuffer = Object.getOwnPropertyDescriptor(
  DataView.prototype,
  "buffer",
)!.get!;
const typedArrayName = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  Symbol.toStringTag,
)!.get!;
const weakMapHas = WeakMap.prototype.has,
  weakSetHas = WeakSet.prototype.has;
const key = {};
function accepts(fn: Function, value: unknown, args: unknown[] = []) {
  try {
    Reflect.apply(fn, value, args);
    return true;
  } catch {
    return false;
  }
}
export const isArrayBuffer = (value: unknown) =>
  accepts(arrayBufferLength, value);
export const isDataView = (value: unknown) => accepts(dataViewBuffer, value);
export const isTypedArray = (value: unknown) =>
  Reflect.apply(typedArrayName, value, []) !== undefined;
export const isWeakMap = (value: unknown) => accepts(weakMapHas, value, [key]);
export const isWeakSet = (value: unknown) => accepts(weakSetHas, value, [key]);
