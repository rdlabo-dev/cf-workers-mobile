import { NodeError } from "../net/errors.js";
export {
  ERR_INVALID_ARG_TYPE,
  ERR_INVALID_ARG_VALUE,
  ERR_OPTION_NOT_IMPLEMENTED,
} from "../net/errors.js";
export class DnsError extends NodeError {
  errno = undefined;
  hostname: string;
  syscall: string;
  constructor(hostname: string, code: string, syscall: string) {
    super(code, `${syscall} ${code} ${hostname}`);
    this.hostname = hostname;
    this.syscall = syscall;
  }
}
