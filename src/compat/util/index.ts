import { debuglog } from "./debuglog.js";
import {
  inspect,
  format,
  formatWithOptions,
  stripVTControlCharacters,
} from "./inspect.js";
export {
  debuglog,
  inspect,
  format,
  formatWithOptions,
  stripVTControlCharacters,
};
export const debug = debuglog;
import * as additional from "./additional.js";
export * from "./additional.js";
import { MIMEType, MIMEParams } from "./mime.js";
export { MIMEType, MIMEParams };
import * as core from "./core.js";
export * from "./core.js";
// Vite dev cannot discover named exports through `export *` from CommonJS.
// @ts-expect-error the polyfill ships CJS without declarations
import util from "util/util.js";
import { Buffer } from "node:buffer";
export const types = util.types;
export const isArray = Array.isArray;
export const isBoolean = (val: unknown): boolean => typeof val === "boolean";
export const isBuffer = (val: unknown): boolean => Buffer.isBuffer(val);
export const isDate = (val: unknown): boolean => val instanceof Date;
export const isError = (val: unknown): boolean =>
  (Error as ErrorConstructor & { isError(value: unknown): boolean }).isError(
    val,
  );
export const isFunction = (val: unknown): boolean => typeof val === "function";
export const isNull = (val: unknown): boolean => val === null;
export const isNullOrUndefined = (val: unknown): boolean => val == null;
export const isNumber = (val: unknown): boolean => typeof val === "number";
export const isObject = (val: unknown): boolean =>
  val != null && typeof val === "object";
export const isPrimitive = (val: unknown): boolean =>
  val === null || (typeof val !== "object" && typeof val !== "function");
export const isRegExp = (val: unknown): boolean => val instanceof RegExp;
export const isString = (val: unknown): boolean => typeof val === "string";
export const isSymbol = (val: unknown): boolean => typeof val === "symbol";
export const isUndefined = (val: unknown): boolean => val === undefined;
function pad(n: unknown): string {
  return `${n}`.padStart(2, "0");
}

// prettier-ignore
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
                'Oct', 'Nov', 'Dec'];

function timestamp(): string {
  const d = new Date();
  const t = [pad(d.getHours()), pad(d.getMinutes()), pad(d.getSeconds())].join(
    ":",
  );
  return `${d.getDate()} ${months[d.getMonth()]} ${t}`;
}

export function log(...args: unknown[]): void {
  console.log("%s - %s", timestamp(), format(...args));
}

export const TextEncoder = globalThis.TextEncoder;
export const TextDecoder = globalThis.TextDecoder;
export default {
  ...util,
  ...core,
  ...additional,
  isArray,
  isBoolean,
  isBuffer,
  isDate,
  isError,
  isFunction,
  isNull,
  isNullOrUndefined,
  isNumber,
  isObject,
  isPrimitive,
  isRegExp,
  isString,
  isSymbol,
  isUndefined,
  log,

  debuglog,
  debug,
  inspect,
  format,
  formatWithOptions,
  stripVTControlCharacters,
  TextEncoder,
  TextDecoder,
  MIMEType,
  MIMEParams,
};
