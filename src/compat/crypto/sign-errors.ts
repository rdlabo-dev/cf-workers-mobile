// Adapted from workerd internal_errors.ts (Apache-2.0 / Node MIT).
import { NodeError } from "../net/error-base.js";
export { ERR_INVALID_ARG_TYPE, ERR_INVALID_ARG_VALUE } from "../net/errors.js";
export class ERR_CRYPTO_SIGN_KEY_REQUIRED extends NodeError {
  constructor() {
    super("ERR_CRYPTO_SIGN_KEY_REQUIRED", "No key provided to sign");
  }
}

export class ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE extends NodeError {
  constructor(actual: string, expected: string) {
    super(
      "ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE",
      `Invalid key object type ${actual}, expected ${expected}.`,
    );
  }
}
