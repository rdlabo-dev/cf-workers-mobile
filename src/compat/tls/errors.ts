// @ts-nocheck
// Adapted from pinned workerd internal_errors.ts (Apache-2.0 / Node MIT).
import { NodeError, NodeTypeError } from "../net/error-base.js";
import type { PeerCertificate } from "node:tls";
class NodeSyntaxError extends SyntaxError {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
export { ERR_OUT_OF_RANGE, ERR_OPTION_NOT_IMPLEMENTED } from "../net/errors.js";
export class ERR_TLS_HANDSHAKE_TIMEOUT extends NodeError {
  constructor() {
    super("ERR_TLS_HANDSHAKE_TIMEOUT", "TLS handshake timeout");
  }
}

export class ERR_TLS_INVALID_CONTEXT extends NodeTypeError {
  constructor(field: string) {
    super("ERR_TLS_INVALID_CONTEXT", `${field} must be a SecureContext`);
  }
}

export class ERR_TLS_CERT_ALTNAME_INVALID extends NodeError {
  reason: string;
  host: string;
  cert?: Partial<PeerCertificate> | undefined;

  constructor(reason: string, host: string, cert?: Partial<PeerCertificate>) {
    super("ERR_TLS_CERT_ALTNAME_INVALID", reason);
    this.reason = reason;
    this.host = host;
    this.cert = cert;
  }
}

export class ERR_TLS_CERT_ALTNAME_FORMAT extends NodeSyntaxError {
  constructor() {
    super(
      "ERR_TLS_CERT_ALTNAME_FORMAT",
      "Invalid subject alternative name string",
    );
  }
}

export class ConnResetException extends NodeError {
  path?: string | undefined;
  host?: string | undefined;
  port?: number | undefined;
  localAddress?: string | undefined;

  constructor(message: string) {
    super("ECONNRESET", message);
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

export class ERR_STREAM_WRAP extends NodeError {
  constructor() {
    super(
      "ERR_STREAM_WRAP",
      "Stream has StringDecoder set or is in objectMode",
    );
  }
}

export class ERR_METHOD_NOT_IMPLEMENTED extends NodeError {
  constructor(name: string) {
    super(
      "ERR_METHOD_NOT_IMPLEMENTED",
      `The ${name} method is not implemented`,
    );
  }
}
