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

import { validateFunction, validateString } from "../net/validators.js";
import { ERR_INVALID_ARG_TYPE, NodeError } from "../net/errors.js";
const kCustomPromisifiedSymbol = Symbol.for("nodejs.util.promisify.custom");
const kCustomPromisifyArgsSymbol = Symbol.for(
  "nodejs.util.promisify.custom.args",
);

// TODO(later): Proper type signature for promisify.
/* eslint-disable */
export function promisify(original: Function): Function {
  validateFunction(original, "original");

  if ((original as any)[kCustomPromisifiedSymbol]) {
    const fn = (original as any)[kCustomPromisifiedSymbol];

    validateFunction(fn, "util.promisify.custom");

    return Object.defineProperty(fn, kCustomPromisifiedSymbol, {
      value: fn,
      enumerable: false,
      writable: false,
      configurable: true,
    });
  }

  // Names to create an object from in case the callback receives multiple
  // arguments, e.g. ['bytesRead', 'buffer'] for fs.read.
  const argumentNames = (original as any)[kCustomPromisifyArgsSymbol];

  function fn(this: any, ...args: any[]) {
    return new Promise((resolve, reject) => {
      args.push((err: unknown, ...values: unknown[]) => {
        if (err) {
          return reject(err);
        }
        if (argumentNames !== undefined && values.length > 1) {
          const obj = {};
          for (let i = 0; i < argumentNames.length; i++)
            (obj as any)[argumentNames[i]] = values[i];
          resolve(obj);
        } else {
          resolve(values[0]);
        }
      });
      Reflect.apply(original, this, args);
    });
  }

  Object.setPrototypeOf(fn, Object.getPrototypeOf(original));

  Object.defineProperty(fn, kCustomPromisifiedSymbol, {
    value: fn,
    enumerable: false,
    writable: false,
    configurable: true,
  });

  const descriptors = Object.getOwnPropertyDescriptors(original);
  const propertiesValues = Object.values(descriptors);
  for (let i = 0; i < propertiesValues.length; i++) {
    // We want to use null-prototype objects to not rely on globally mutable
    // %Object.prototype%.
    Object.setPrototypeOf(propertiesValues[i], null);
  }
  return Object.defineProperties(fn, descriptors);
}

promisify.custom = kCustomPromisifiedSymbol;
/* eslint-enable */

export function inherits(
  ctor: Function | null | undefined, // eslint-disable-line @typescript-eslint/no-unsafe-function-type
  superCtor: Function | null | undefined, // eslint-disable-line @typescript-eslint/no-unsafe-function-type
): void {
  if (ctor == null) throw new ERR_INVALID_ARG_TYPE("ctor", "Function", ctor);

  if (superCtor === undefined || superCtor === null)
    throw new ERR_INVALID_ARG_TYPE("superCtor", "Function", superCtor);

  if (superCtor.prototype === undefined) {
    throw new ERR_INVALID_ARG_TYPE(
      "superCtor.prototype",
      "Object",
      superCtor.prototype,
    );
  }
  Object.defineProperty(ctor, "super_", {
    value: superCtor,
    writable: true,
    configurable: true,
  });
  Object.setPrototypeOf(ctor.prototype, superCtor.prototype); // eslint-disable-line @typescript-eslint/no-unsafe-argument
}

export function _extend<T extends Record<string, unknown>>(
  target: T,
  source: unknown,
): T {
  // Don't do anything if source isn't an object
  if (source === null || typeof source !== "object") return target;

  const keys = Object.keys(source);
  let i = keys.length;
  while (i--) {
    (target as Record<string, unknown>)[keys[i] as keyof typeof source] = (
      source as Record<string, unknown>
    )[keys[i] as keyof typeof source];
  }
  return target;
}

function callbackifyOnRejected(
  reason: unknown,
  cb: (error?: unknown) => void,
): void {
  // `!reason` guard inspired by bluebird (https://github.com/petkaantonov/bluebird/blob/2207fae3572f03b089bc92d3a6cefdd278cff7ab/src/nodeify.js#L30-L43).
  // Because `null` is a special error value in callbacks which means "no error
  // occurred", we error-wrap so the callback consumer can distinguish between
  // "the promise rejected with null" or "the promise fulfilled with undefined".
  if (!reason) {
    // Construct lazily: error formatting depends on util.inspect, so a
    // module-level subclass would create a Vite development import cycle.
    reason = Object.assign(
      new NodeError(
        "ERR_FALSY_VALUE_REJECTION",
        "Promise was rejected with falsy value",
      ),
      { reason },
    );
  }
  cb(reason);
}

export function callbackify<T extends (...args: unknown[]) => Promise<unknown>>(
  original: T,
): T extends (...args: infer TArgs) => Promise<infer TReturn>
  ? (...params: [...TArgs, (err: Error, ret: TReturn) => unknown]) => void
  : never {
  validateFunction(original, "original");

  function callbackified(
    this: unknown,
    ...args: [...unknown[], (err: unknown, ret: unknown) => void]
  ): void {
    const maybeCb = args.pop();
    validateFunction(maybeCb, "last argument");
    const cb = maybeCb.bind(this);
    Reflect.apply(original, this, args).then(
      (ret: unknown) => {
        queueMicrotask(() => cb(null, ret));
      },
      (rej: unknown) => {
        queueMicrotask(() => {
          callbackifyOnRejected(rej, cb);
        });
      },
    );
  }

  const descriptors = Object.getOwnPropertyDescriptors(original);
  if (typeof descriptors.length?.value === "number") {
    descriptors.length.value++;
  }
  if (typeof descriptors.name?.value === "string") {
    descriptors.name.value += "Callbackified";
  }
  const propertiesValues = Object.values(descriptors);
  for (let i = 0; i < propertiesValues.length; i++) {
    Object.setPrototypeOf(propertiesValues[i], null);
  }
  Object.defineProperties(callbackified, descriptors);
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error conditional callback signature is preserved at runtime
  return callbackified;
}

export function parseEnv(content: string): Record<string, string> {
  validateString(content, "content");

  const result: Record<string, string> = {};
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line === undefined) continue;

    if (!line.trim()) continue;
    if (line.trimStart().startsWith("#")) continue;
    if (line.trimStart().startsWith("export "))
      line = line.substring(line.indexOf("export ") + 7);

    const equalIndex = line.indexOf("=");
    if (equalIndex === -1) continue;

    const key = line.substring(0, equalIndex).trim();
    if (!key) continue;

    let value = line.substring(equalIndex + 1).trimStart();
    if (value.length > 0) {
      const maybeQuote = value[0];
      if (maybeQuote === '"' || maybeQuote === "'" || maybeQuote === "`") {
        // Check if the closing quote is on the same line
        const closeIndex = value.indexOf(maybeQuote, 1);

        if (closeIndex !== -1) {
          // Found closing quote on same line
          value = value.substring(1, closeIndex);
          // Only handle escape sequences for double quotes
          if (maybeQuote === '"') value = value.replace(/\\n/g, "\n");
          // For single quotes and backticks, keep \n as literal
        } else {
          // Check for multiline strings
          let fullValue = value.substring(1); // Remove opening quote
          let currentLine = i;
          let foundClosingQuote = false;

          // Look for closing quote in subsequent lines
          while (currentLine < lines.length - 1) {
            currentLine++;
            const nextLine = lines[currentLine];
            if (nextLine !== undefined) {
              const closeInNextLine = nextLine.indexOf(maybeQuote);
              if (closeInNextLine !== -1) {
                // Found closing quote
                fullValue += "\n" + nextLine.substring(0, closeInNextLine);
                value = fullValue;

                // Only handle escape sequences for double quotes
                if (maybeQuote === '"') {
                  value = value.replace(/\\n/g, "\n");
                }

                foundClosingQuote = true;
                i = currentLine; // Update line counter
                break;
              } else {
                // Continue building multiline value
                fullValue += "\n" + nextLine;
              }
            }
          }

          if (!foundClosingQuote) {
            if (value.length === 1) {
              // Just the quote character, return it as the value
              value = maybeQuote;
            } else {
              // Return content after the opening quote
              value = value.substring(1);
            }
          }
        }
      } else {
        const hashIndex = value.indexOf("#");
        if (hashIndex !== -1) value = value.substring(0, hashIndex);
        value = value.trimEnd();
      }
    }
    result[key] = value;
  }
  return result;
}

export function parseArgs(): unknown {
  // We currently have no plans to implement the util.parseArgs API.
  throw new Error("node:util parseArgs is not implemented");
}

export function transferableAbortController(): void {
  throw new Error("node:util transferableAbortController is not implemented");
}

export function transferableAbortSignal(): void {
  throw new Error("node:util transferableAbortSignal is not implemented");
}

export function deprecate<T = unknown>(
  fn: T,
  _1?: string,
  _2?: string,
  _3?: boolean,
): T {
  // TODO(soon): Node.js's implementation wraps the given function in a new function that
  // logs a warning to the console if the function is called. Do we want to support that?
  // For now, we're just going to silently return the input method unmodified.
  return fn;
}

export function getSystemErrorMap(): void {
  throw new Error("node:util getSystemErrorMap is not implemented");
}

export function getSystemErrorName(): void {
  throw new Error("node:util getSystemErrorName is not implemented");
}

export function getSystemErrorMessage(): void {
  throw new Error("node:util getSystemErrorMessage is not implemented");
}
