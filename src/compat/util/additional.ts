// Copyright (c) 2017-2022 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0
import {
  validateAbortSignal,
  validateObject,
  validateString,
  validateBoolean,
  validateOneOf,
  kValidateObjectAllowArray,
  kValidateObjectAllowFunction,
} from "../net/validators.js";
import { ERR_INVALID_ARG_TYPE } from "../net/errors.js";
import { NodeError } from "../net/error-base.js";
import { inspect } from "./inspect.js";
import { isDeepStrictEqual as compare } from "./comparisons.js";
class ERR_METHOD_NOT_IMPLEMENTED extends NodeError {
  constructor(name: string) {
    super(
      "ERR_METHOD_NOT_IMPLEMENTED",
      `The ${name} method is not implemented`,
    );
  }
}
export function isDeepStrictEqual(a: unknown, b: unknown): boolean {
  return compare(a, b);
}
export function toUSVString(input: string): string {
  return (input as string & { toWellFormed(): string }).toWellFormed();
}

export async function aborted(
  signal: unknown,
  resource: unknown,
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
): Promise<Event | void> {
  if (signal === undefined) {
    throw new ERR_INVALID_ARG_TYPE("signal", "AbortSignal", signal);
  }
  // Node.js defines that the resource is held weakly such that if it is GC'ed, we
  // will drop the event handler on the signal and the promise will remain pending
  // forever. We don't want GC to be observable in the same way so we won't support
  // this additional option. Unfortunately Node.js does not make this argument optional.
  // We'll just ignore it.
  validateAbortSignal(signal, "signal");
  validateObject(
    resource,
    "resource",
    kValidateObjectAllowArray | kValidateObjectAllowFunction,
  );
  if (signal.aborted) return Promise.resolve();
  const { promise, resolve } = (() => {
    let resolve!: (event: Event) => void;
    const promise = new Promise<Event>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  })();
  const opts = { __proto__: null, once: true };
  signal.addEventListener("abort", resolve, opts);
  return promise;
}

function isNodeStream(obj: any): boolean {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return (
    obj &&
    (obj._readableState != null ||
      obj._writableState != null ||
      (typeof obj.write === "function" && typeof obj.on === "function") ||
      (typeof obj.pipe === "function" && typeof obj.on === "function"))
  );
}

function isReadableStream(obj: any): obj is ReadableStream {
  return !!(
    obj &&
    !isNodeStream(obj) &&
    typeof obj.pipeThrough === "function" &&
    typeof obj.getReader === "function" &&
    typeof obj.cancel === "function"
  );
}

function isWritableStream(obj: any): obj is WritableStream {
  return !!(
    obj &&
    !isNodeStream(obj) &&
    typeof obj.getWriter === "function" &&
    typeof obj.abort === "function"
  );
}

function escapeStyleCode(code: number | undefined): string {
  if (code === undefined) return "";
  return `\u001b[${code}m`;
}

// TODO(soon): We do not yet implement process.stdout, so to ensure the correct
// behaviour, we use a placeholder value internally.

interface StyleTextOptions {
  validateStream?: boolean;
  stream?: ReadableStream | WritableStream;
}

type TTYStream = (ReadableStream | WritableStream) & {
  isTTY: true;
  getColorDepth(): number;
};

function isTTYStream(stream: unknown): stream is TTYStream {
  return (
    stream != null &&
    typeof stream === "object" &&
    "isTTY" in stream &&
    !!stream.isTTY &&
    typeof (stream as TTYStream).getColorDepth === "function"
  );
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const stdoutPlaceholder: StyleTextOptions["stream"] = Object.create(null);
export function styleText(
  format: string | string[],
  text: unknown,
  { validateStream = true, stream = stdoutPlaceholder }: StyleTextOptions = {},
): string {
  validateString(text, "text");
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-boolean-literal-compare
  if (validateStream !== true)
    validateBoolean(validateStream, "options.validateStream");

  let skipColorize: boolean = false;
  if (validateStream) {
    if (
      !isReadableStream(stream) &&
      !isWritableStream(stream) &&
      !isNodeStream(stream) &&
      stream !== stdoutPlaceholder
    ) {
      throw new ERR_INVALID_ARG_TYPE(
        "stream",
        ["ReadableStream", "WritableStream", "Stream"],
        stream,
      );
    }

    // If the stream is falsy or should not be colorized, set skipColorize to true
    skipColorize = isTTYStream(stream) ? stream.getColorDepth() > 2 : true;
  }

  // If the format is not an array, convert it to an array
  const formatArray = Array.isArray(format) ? format : [format];

  let left = "";
  let right = "";
  for (const key of formatArray) {
    if (key === "none") continue;
    const formatCodes =
      typeof key === "string" ? inspect.colors[key] : undefined;
    // If the format is not a valid style, throw an error
    if (formatCodes == null) {
      validateOneOf(key, "format", Object.keys(inspect.colors));
    }
    if (skipColorize) continue;
    left += escapeStyleCode(formatCodes ? formatCodes[0] : undefined);
    right = `${escapeStyleCode(formatCodes ? formatCodes[1] : undefined)}${right}`;
  }

  return skipColorize ? text : `${left}${text}${right}`;
}

export function _errnoException(): void {
  // TODO(soon): We might support this in the future.
  throw new ERR_METHOD_NOT_IMPLEMENTED("_errnoException");
}

export function _exceptionWithHostPort(): void {
  // TODO(soon): We might support this in the future.
  throw new ERR_METHOD_NOT_IMPLEMENTED("_exceptionWithHostPort");
}
