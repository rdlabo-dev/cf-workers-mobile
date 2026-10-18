// Copyright (c) 2017-2022 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0
//
// Adapted from Deno and Node.js:
// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
//
// Adapted from Node.js. Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

import { inspect } from "node:util";
const classRegExp = /^([A-Z][a-z0-9]*)+$/;

const kTypes = [
  "string",
  "function",
  "number",
  "object",
  "Function",
  "Object",
  "boolean",
  "bigint",
  "symbol",
];

export class NodeErrorAbstraction extends Error {
  code: string;

  constructor(name: string, code: string, message: string) {
    super(message);
    this.code = code;
    this.name = name;
  }

  override toString(): string {
    return `${this.name} [${this.code}]: ${this.message}`;
  }
}

export class NodeError extends NodeErrorAbstraction {
  constructor(code: string, message: string) {
    super(Error.prototype.name, code, message);
  }
}

export class NodeRangeError extends NodeErrorAbstraction {
  constructor(code: string, message: string) {
    super(RangeError.prototype.name, code, message);
    Object.setPrototypeOf(this, RangeError.prototype);
    this.toString = function (): string {
      return `${this.name} [${this.code}]: ${this.message}`;
    };
  }
}

export class NodeTypeError extends NodeErrorAbstraction implements TypeError {
  constructor(code: string, message: string) {
    super(TypeError.prototype.name, code, message);
    Object.setPrototypeOf(this, TypeError.prototype);
    this.toString = function (): string {
      return `${this.name} [${this.code}]: ${this.message}`;
    };
  }
}

function createInvalidArgType(
  name: string,
  expected: string | string[],
): string {
  // https://github.com/nodejs/node/blob/f3eb224/lib/internal/errors.js#L1037-L1087
  expected = Array.isArray(expected) ? expected : [expected];
  let msg = "The ";
  if (name.endsWith(" argument")) {
    // For cases like 'first argument'
    msg += `${name} `;
  } else {
    const type = name.includes(".") ? "property" : "argument";
    msg += `"${name}" ${type} `;
  }
  msg += "must be ";

  const types = [];
  const instances = [];
  const other = [];
  for (const value of expected) {
    if (kTypes.includes(value)) {
      types.push(value.toLocaleLowerCase());
    } else if (classRegExp.test(value)) {
      instances.push(value);
    } else {
      other.push(value);
    }
  }

  // Special handle `object` in case other instances are allowed to outline
  // the differences between each other.
  if (instances.length > 0) {
    const pos = types.indexOf("object");
    if (pos !== -1) {
      types.splice(pos, 1);
      instances.push("Object");
    }
  }

  if (types.length > 0) {
    if (types.length > 2) {
      const last = types.pop();
      msg += `one of type ${types.join(", ")}, or ${last}`;
    } else if (types.length === 2) {
      msg += `one of type ${types[0]} or ${types[1]}`;
    } else {
      msg += `of type ${types[0]}`;
    }
    if (instances.length > 0 || other.length > 0) {
      msg += " or ";
    }
  }

  if (instances.length > 0) {
    if (instances.length > 2) {
      const last = instances.pop();
      msg += `an instance of ${instances.join(", ")}, or ${last}`;
    } else {
      msg += `an instance of ${instances[0]}`;
      if (instances.length === 2) {
        msg += ` or ${instances[1]}`;
      }
    }
    if (other.length > 0) {
      msg += " or ";
    }
  }

  if (other.length > 0) {
    if (other.length > 2) {
      const last = other.pop();
      msg += `one of ${other.join(", ")}, or ${last}`;
    } else if (other.length === 2) {
      msg += `one of ${other[0]} or ${other[1]}`;
    } else {
      if (other[0]?.toLowerCase() !== other[0]) {
        msg += "an ";
      }
      msg += `${other[0]}`;
    }
  }

  return msg;
}

function invalidArgTypeHelper(input: unknown): string {
  if (input == null) {
    return ` Received ${input}`;
  }
  if (typeof input === "function" && input.name) {
    return ` Received function ${input.name}`;
  }
  if (typeof input === "object") {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (input.constructor?.name) {
      return ` Received an instance of ${input.constructor.name}`;
    }
    return ` Received ${inspect(input, { depth: -1 })}`;
  }
  let inspected = inspect(input, { colors: false });
  if (inspected.length > 25) {
    inspected = `${inspected.slice(0, 25)}...`;
  }
  return ` Received type ${typeof input} (${inspected})`;
}

function addNumericalSeparator(val: string): string {
  let res = "";
  let i = val.length;
  const start = val[0] === "-" ? 1 : 0;
  for (; i >= start + 4; i -= 3) {
    res = `_${val.slice(i - 3, i)}${res}`;
  }
  return `${val.slice(0, i)}${res}`;
}

export class ERR_INVALID_ARG_TYPE_RANGE extends NodeRangeError {
  constructor(name: string, expected: string | string[], actual: unknown) {
    const msg = createInvalidArgType(name, expected);

    super("ERR_INVALID_ARG_TYPE", `${msg}.${invalidArgTypeHelper(actual)}`);
  }
}

export class ERR_INVALID_ARG_TYPE extends NodeTypeError {
  constructor(name: string, expected: string | string[], actual: unknown) {
    const msg = createInvalidArgType(name, expected);

    super("ERR_INVALID_ARG_TYPE", `${msg}.${invalidArgTypeHelper(actual)}`);
  }

  static RangeError = ERR_INVALID_ARG_TYPE_RANGE;
}

export class ERR_INVALID_ARG_VALUE_RANGE extends NodeRangeError {
  constructor(name: string, value: unknown, reason: string = "is invalid") {
    const type = name.includes(".") ? "property" : "argument";
    const inspected = inspect(value);

    super(
      "ERR_INVALID_ARG_VALUE",
      `The ${type} '${name}' ${reason}. Received ${inspected}`,
    );
  }
}

export class ERR_INVALID_ARG_VALUE extends NodeTypeError {
  constructor(name: string, value: unknown, reason: string = "is invalid") {
    const type = name.includes(".") ? "property" : "argument";
    const inspected = inspect(value);

    super(
      "ERR_INVALID_ARG_VALUE",
      `The ${type} '${name}' ${reason}. Received ${inspected}`,
    );
  }

  static RangeError = ERR_INVALID_ARG_VALUE_RANGE;
}

export class ERR_OUT_OF_RANGE extends RangeError {
  code = "ERR_OUT_OF_RANGE";

  constructor(
    str: string,
    range: string,
    input: unknown,
    replaceDefaultBoolean = false,
  ) {
    // TODO(later): Implement internal assert?
    // assert(range, 'Missing "range" argument');
    let msg = replaceDefaultBoolean
      ? str
      : `The value of "${str}" is out of range.`;
    let received;
    if (Number.isInteger(input) && Math.abs(input as number) > 2 ** 32) {
      received = addNumericalSeparator(String(input));
    } else if (typeof input === "bigint") {
      received = String(input);
      if (input > 2n ** 32n || input < -(2n ** 32n)) {
        received = addNumericalSeparator(received);
      }
      received += "n";
    } else {
      received = inspect(input);
    }
    msg += ` It must be ${range}. Received ${received}`;

    super(msg);

    const { name } = this;
    // Add the error code to the name to include it in the stack trace.
    this.name = `${name} [${this.code}]`;
    // Access the stack to generate the error message including the error code from the name.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    this.stack;
    // Reset the name to the actual name.
    this.name = name;
  }
}

export class AbortError extends Error {
  code: string;

  constructor(message = "The operation was aborted", options?: ErrorOptions) {
    if (options !== undefined && typeof options !== "object") {
      throw new ERR_INVALID_ARG_TYPE("options", "Object", options);
    }
    super(message, options);
    this.code = "ABORT_ERR";
    this.name = "AbortError";
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

export class ERR_OPTION_NOT_IMPLEMENTED extends NodeError {
  constructor(name: string | symbol) {
    if (typeof name === "symbol") {
      name = name.description as string;
    }
    super(
      "ERR_OPTION_NOT_IMPLEMENTED",
      `The ${name} option is not implemented`,
    );
  }
}

export class ERR_SOCKET_BAD_PORT extends NodeError {
  constructor(name: string, port: unknown, allowZero: boolean) {
    const operator = allowZero ? ">=" : ">";
    super(
      "ERR_SOCKET_BAD_PORT",
      `${name} should be ${operator} 0 and < 65536. Received ${typeof port}.`,
    );
  }
}

export class EADDRINUSE extends NodeError {
  syscall = "bind";
  address: string;
  port: number;

  constructor(address: string, port: number) {
    super("EADDRINUSE", `bind EADDRINUSE ${address}:${port}`);
    this.address = address;
    this.port = port;
  }
}

export class EADDRNOTAVAIL extends NodeError {
  syscall = "bind";
  address: string;
  port: number;

  constructor(address: string, port: number) {
    super("EADDRNOTAVAIL", `bind EADDRNOTAVAIL ${address}:${port}`);
    this.address = address;
    this.port = port;
  }
}

export class EPIPE extends NodeError {
  constructor() {
    super("EPIPE", "This socket has been ended by the other party");
  }
}

export class ENOBUFS extends NodeError {
  syscall = "read";

  constructor() {
    super("ENOBUFS", "read ENOBUFS");
  }
}

export class ERR_SOCKET_CLOSED_BEFORE_CONNECTION extends NodeError {
  constructor() {
    super(
      "ERR_SOCKET_CLOSED_BEFORE_CONNECTION",
      "Socket closed before connection established",
    );
  }
}

export class ERR_SOCKET_CLOSED extends NodeError {
  constructor() {
    super("ERR_SOCKET_CLOSED", "Socket is closed");
  }
}

export class ERR_SOCKET_CONNECTING extends NodeError {
  constructor() {
    super("ERR_SOCKET_CONNECTING", "Socket is already connecting");
  }
}

export class ERR_SOCKET_HANDLE_ADOPTED extends NodeError {
  constructor() {
    super(
      "ERR_SOCKET_HANDLE_ADOPTED",
      "The bound socket has already been adopted by a server or socket",
    );
  }
}

export class ERR_INVALID_IP_ADDRESS extends NodeTypeError {
  constructor(ipAddress: string) {
    super("ERR_INVALID_IP_ADDRESS", `Invalid IP address: ${ipAddress}`);
  }
}

export class ERR_INVALID_ADDRESS extends NodeTypeError {
  constructor() {
    super("ERR_INVALID_ADDRESS", "Invalid socket address");
  }
}

export class ERR_SERVER_ALREADY_LISTEN extends NodeError {
  constructor() {
    super(
      "ERR_SERVER_ALREADY_LISTEN",
      "Listen method has been called more than once without closing.",
    );
  }
}

export class ERR_SERVER_NOT_RUNNING extends NodeError {
  constructor() {
    super("ERR_SERVER_NOT_RUNNING", "Server is not running.");
  }
}
