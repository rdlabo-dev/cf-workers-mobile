import {
  viewBytes,
  isAnyBuffer,
  bufferBytes,
} from "../../shared/buffer-source.js";

export function bindingInput(
  value: unknown,
  context: string,
  parameter = 2,
): Uint8Array {
  if (ArrayBuffer.isView(value)) return viewBytes(value);
  if (isAnyBuffer(value)) return bufferBytes(value);
  throw new TypeError(
    `Failed to execute 'writeSync' on '${context}>': parameter ${parameter} is not of type 'BufferSource'.`,
  );
}
export function nativeNumber(value: any): number {
  const object = (item: any) =>
    item !== null && (typeof item === "object" || typeof item === "function");
  if (object(value)) {
    const exotic = value[Symbol.toPrimitive];
    if (exotic != null) {
      value = Reflect.apply(exotic, value, ["number"]);
      if (object(value))
        throw new TypeError("Cannot convert object to primitive value");
    } else {
      const original = value;
      for (const name of ["valueOf", "toString"]) {
        const method = original[name];
        if (typeof method !== "function") continue;
        value = Reflect.apply(method, original, []);
        if (!object(value)) break;
      }
      if (object(value))
        throw new TypeError("Cannot convert object to primitive value");
    }
  }
  if (typeof value === "bigint")
    throw new TypeError("Cannot convert a BigInt value to a number");
  if (typeof value === "symbol")
    throw new TypeError("Cannot convert a Symbol value to a number");
  return Number(value);
}
function uint32(value: unknown): number {
  const number = nativeNumber(value);
  if (!Number.isFinite(number))
    throw new TypeError(
      "The value cannot be converted because it is not an integer.",
    );
  if (number < 0)
    throw new TypeError(
      "The value cannot be converted because it is negative and this API expects a positive number.",
    );
  if (number > 4294967295)
    throw new TypeError(
      "Value out of range. Must be less than or equal to 4294967295.",
    );
  return Math.trunc(number);
}
export function bindingBuffers(
  context: string,
  input: unknown,
  inputOffset: number,
  inputLength: number,
  output: unknown,
  outputOffset: number,
  outputLength: number,
) {
  const source =
    input === undefined ? new Uint8Array(0) : bindingInput(input, context);
  inputOffset = uint32(inputOffset);
  inputLength = uint32(inputLength);
  const target = bindingInput(output, context, 5);
  outputOffset = uint32(outputOffset);
  outputLength = uint32(outputLength);
  if (input === undefined) inputOffset = inputLength = 0;
  if (
    inputOffset + inputLength > 4294967295 ||
    inputOffset > source.byteLength ||
    inputLength > source.byteLength - inputOffset
  )
    throw new Error("Input access is not within bounds");
  if (
    outputOffset + outputLength > 4294967295 ||
    outputOffset > target.byteLength ||
    outputLength > target.byteLength - outputOffset
  )
    throw new Error("Output access is not within bounds");
  // Emscripten's wasm32 malloc must not receive a wrapped allocation length.
  if (Math.max(1, inputLength) + outputLength + 8 > 0x7fffffff)
    throw new RangeError("Memory limit exceeded");
  return {
    source,
    target,
    inputOffset,
    inputLength,
    outputOffset,
    outputLength,
  };
}
