// Additional validators from workerd v1.20261012.1. Common validators stay in net.
export * from "../net/validators.js";
import { validateArray } from "../net/validators.js";
import { ERR_INVALID_ARG_TYPE } from "../net/errors.js";
export function validateBuffer(value: unknown, name: string) {
  if (!ArrayBuffer.isView(value))
    throw new ERR_INVALID_ARG_TYPE(
      name,
      ["Buffer", "TypedArray", "DataView"],
      value,
    );
}
export function validateStringArray(
  value: unknown,
  name: string,
): asserts value is string[] {
  validateArray(value, name);
  for (let i = 0; i < value.length; i++)
    if (typeof value[i] !== "string")
      throw new ERR_INVALID_ARG_TYPE(`${name}[${i}]`, "string", value[i]);
}
