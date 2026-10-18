import { NodeError } from "../net/errors.js";
export class ERR_METHOD_NOT_IMPLEMENTED extends NodeError {
  constructor(name: string) {
    super(
      "ERR_METHOD_NOT_IMPLEMENTED",
      `The ${name} method is not implemented`,
    );
  }
}
