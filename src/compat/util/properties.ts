// Ported from workerd 5358e3d internal_utils.ts (Apache-2.0, MIT).
export const ALL_PROPERTIES = 0;
export const ONLY_WRITABLE = 1;
export const ONLY_ENUMERABLE = 2;
export const ONLY_CONFIGURABLE = 4;
export const ONLY_ENUM_WRITABLE = 6;
export const SKIP_STRINGS = 8;
export const SKIP_SYMBOLS = 16;

const isNumericLookup: Record<string, boolean> = {};
export function isArrayIndex(value: unknown): value is number | string {
  switch (typeof value) {
    case "number":
      return value >= 0 && (value | 0) === value;
    case "string": {
      const result = isNumericLookup[value];
      if (result !== void 0) {
        return result;
      }
      const length = value.length;
      if (length === 0) {
        return (isNumericLookup[value] = false);
      }
      let ch = 0;
      let i = 0;
      for (; i < length; ++i) {
        ch = value.charCodeAt(i);
        if (
          (i === 0 && ch === 0x30 && length > 1) /* must not start with 0 */ ||
          ch < 0x30 /* 0 */ ||
          ch > 0x39 /* 9 */
        ) {
          return (isNumericLookup[value] = false);
        }
      }
      return (isNumericLookup[value] = true);
    }
    default:
      return false;
  }
}

export function getOwnNonIndexProperties(
  // deno-lint-ignore ban-types
  obj: object,
  filter: number,
): (string | symbol)[] {
  let allProperties = [
    ...Object.getOwnPropertyNames(obj),
    ...Object.getOwnPropertySymbols(obj),
  ];

  if (Array.isArray(obj)) {
    allProperties = allProperties.filter((k) => !isArrayIndex(k));
  }

  if (filter === ALL_PROPERTIES) {
    return allProperties;
  }

  const result: (string | symbol)[] = [];
  for (const key of allProperties) {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (desc === undefined) {
      continue;
    }
    if (filter & ONLY_WRITABLE && !desc.writable) {
      continue;
    }
    if (filter & ONLY_ENUMERABLE && !desc.enumerable) {
      continue;
    }
    if (filter & ONLY_CONFIGURABLE && !desc.configurable) {
      continue;
    }
    if (filter & SKIP_STRINGS && typeof key === "string") {
      continue;
    }
    if (filter & SKIP_SYMBOLS && typeof key === "symbol") {
      continue;
    }
    result.push(key);
  }
  return result;
}
