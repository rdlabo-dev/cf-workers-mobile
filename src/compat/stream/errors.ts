// @ts-nocheck
import { NodeError, NodeTypeError } from "../net/errors.js";
export {
  AbortError,
  ERR_INVALID_ARG_TYPE,
  ERR_INVALID_ARG_VALUE,
  ERR_MISSING_ARGS,
  ERR_OUT_OF_RANGE,
} from "../net/errors.js";
export { ERR_INVALID_RETURN_VALUE } from "../assert/errors.js";
export class ERR_METHOD_NOT_IMPLEMENTED extends NodeError {
  constructor(name: string | symbol) {
    if (typeof name === "symbol") {
      name = name.description as string;
    }
    super(
      "ERR_METHOD_NOT_IMPLEMENTED",
      `The ${name} method is not implemented`,
    );
  }
}

export class ERR_MULTIPLE_CALLBACK extends NodeError {
  constructor() {
    super("ERR_MULTIPLE_CALLBACK", "Callback called multiple times");
  }
}

export class ERR_STREAM_ALREADY_FINISHED extends NodeError {
  constructor(name: string | symbol) {
    if (typeof name === "symbol") {
      name = name.description as string;
    }
    super(
      "ERR_STREAM_ALREADY_FINISHED",
      `Cannot call ${name} after a stream was finished`,
    );
  }
}
export class ERR_STREAM_CANNOT_PIPE extends NodeError {
  constructor() {
    super("ERR_STREAM_CANNOT_PIPE", "Cannot pipe, not readable");
  }
}
export class ERR_STREAM_DESTROYED extends NodeError {
  constructor(name: string | symbol) {
    if (typeof name === "symbol") {
      name = name.description as string;
    }
    super(
      "ERR_STREAM_DESTROYED",
      `Cannot call ${name} after a stream was destroyed`,
    );
  }
}
export class ERR_STREAM_NULL_VALUES extends NodeTypeError {
  constructor() {
    super("ERR_STREAM_NULL_VALUES", "May not write null values to stream");
  }
}
export class ERR_STREAM_PREMATURE_CLOSE extends NodeTypeError {
  constructor() {
    super("ERR_STREAM_PREMATURE_CLOSE", "Premature close");
  }
}

export class ERR_STREAM_PUSH_AFTER_EOF extends NodeError {
  constructor() {
    super("ERR_STREAM_PUSH_AFTER_EOF", "stream.push() after EOF");
  }
}

export class ERR_STREAM_UNSHIFT_AFTER_END_EVENT extends NodeError {
  constructor() {
    super(
      "ERR_STREAM_UNSHIFT_AFTER_END_EVENT",
      "stream.unshift() after end event",
    );
  }
}

export class ERR_STREAM_WRITE_AFTER_END extends NodeError {
  constructor() {
    super("ERR_STREAM_WRITE_AFTER_END", "write after end");
  }
}

export class ERR_UNKNOWN_ENCODING extends NodeTypeError {
  constructor(x: string) {
    super("ERR_UNKNOWN_ENCODING", `Unknown encoding: ${x}`);
  }
}

export class ERR_WEB_STREAM_INTEROP_UNSUPPORTED extends NodeTypeError {
  constructor(api: string) {
    super(
      "ERR_WEB_STREAM_INTEROP_UNSUPPORTED",
      `${api} is not supported for web streams by the streams implementation in use`,
    );
  }
}

export function aggregateTwoErrors(
  innerError: unknown,
  outerError: Error | null | undefined,
): AggregateError {
  if (innerError && outerError && innerError !== outerError) {
    if ("errors" in outerError && Array.isArray(outerError.errors)) {
      // If `outerError` is already an `AggregateError`.
      outerError.errors.push(innerError);
      return outerError as AggregateError;
    }
    const err = new AggregateError(
      [outerError, innerError],
      outerError.message,
    );
    (err as unknown as NodeError).code = (outerError as NodeError).code;
    return err;
  }
  return (innerError || outerError) as AggregateError;
}
