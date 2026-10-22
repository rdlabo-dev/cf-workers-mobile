// Pinned Workers mode validation (node/internal/validators.ts).
import { validateUint32 } from "../net/validators.js";
import { ERR_INVALID_ARG_VALUE } from "../net/errors.js";
export function fileMode(value: unknown, fallback?: number): number {
  value ??= fallback;
  if (typeof value === "string") {
    if (!/^[0-7]+$/.test(value))
      throw new ERR_INVALID_ARG_VALUE(
        "mode",
        value,
        "must be a 32-bit unsigned integer or an octal string",
      );
    value = Number.parseInt(value, 8);
  }
  validateUint32(value, "mode");
  return value as number;
}
