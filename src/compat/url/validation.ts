import { ERR_INVALID_ARG_TYPE } from "./errors.js";
export function validateString(
  value: unknown,
  name: string,
): asserts value is string {
  if (typeof value !== "string")
    throw new ERR_INVALID_ARG_TYPE(name, "string", value);
}
export function validateObject(
  value: unknown,
  name: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new ERR_INVALID_ARG_TYPE(name, "Object", value);
}
