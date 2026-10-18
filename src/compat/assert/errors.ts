// @ts-nocheck
import { inspect } from "../util/inspect.js";
import { NodeTypeError } from "../net/errors.js";
export { ERR_INVALID_ARG_TYPE, ERR_INVALID_ARG_VALUE } from "../net/errors.js";
function determineSpecificType(value: unknown): string {
  if (value == null) {
    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
    return "" + value;
  }
  if (typeof value === "function" && value.name) {
    return `function ${value.name}`;
  }
  if (typeof value === "object") {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (value.constructor?.name) {
      return `an instance of ${value.constructor.name}`;
    }
    return inspect(value, { depth: -1 });
  }
  let inspected = inspect(value, { colors: false });
  if (inspected.length > 28) inspected = `${inspected.slice(0, 25)}...`;

  return `type ${typeof value} (${inspected})`;
}

export class ERR_AMBIGUOUS_ARGUMENT extends NodeTypeError {
  constructor(x: string, y: string) {
    super("ERR_AMBIGUOUS_ARGUMENT", `The "${x}" argument is ambiguous. ${y}`);
  }
}

export class ERR_INVALID_RETURN_VALUE extends NodeTypeError {
  constructor(input: string, name: string, value: unknown) {
    super(
      "ERR_INVALID_RETURN_VALUE",
      `Expected ${input} to be returned from the "${name}" function but got ${determineSpecificType(
        value,
      )}.`,
    );
  }
}

export class ERR_MISSING_ARGS extends NodeTypeError {
  constructor(...args: (string | string[])[]) {
    let msg = "The ";

    const len = args.length;

    const wrap = (a: unknown): string => `"${a}"`;

    args = args.map((a) =>
      Array.isArray(a) ? a.map(wrap).join(" or ") : wrap(a),
    );

    switch (len) {
      case 1:
        msg += `${args[0]} argument`;
        break;
      case 2:
        msg += `${args[0]} and ${args[1]} arguments`;
        break;
      default:
        msg += args.slice(0, len - 1).join(", ");
        msg += `, and ${args[len - 1]} arguments`;
        break;
    }

    super("ERR_MISSING_ARGS", `${msg} must be specified`);
  }
}
