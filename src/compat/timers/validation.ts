import { ERR_INVALID_ARG_TYPE } from "./errors.js";
export function validateFunction(
  value: unknown,
  name: string,
): asserts value is (...args: unknown[]) => unknown {
  if (typeof value !== "function")
    throw new ERR_INVALID_ARG_TYPE(name, "Function", value);
}
export function validateNumber(
  value: unknown,
  name: string,
): asserts value is number {
  if (typeof value !== "number")
    throw new ERR_INVALID_ARG_TYPE(name, "number", value);
}
export function validateObject(
  value: unknown,
  name: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new ERR_INVALID_ARG_TYPE(name, "Object", value);
}
export function validateBoolean(
  value: unknown,
  name: string,
): asserts value is boolean {
  if (typeof value !== "boolean")
    throw new ERR_INVALID_ARG_TYPE(name, "boolean", value);
}
export function validateAbortSignal(
  value: unknown,
  name: string,
): asserts value is AbortSignal {
  if (
    value !== undefined &&
    (value === null || typeof value !== "object" || !("aborted" in value))
  )
    throw new ERR_INVALID_ARG_TYPE(name, "AbortSignal", value);
}
