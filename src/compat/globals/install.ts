import { installNodeGlobals } from "./index.js";
import { installWebGlobals } from "./web.js";
import { createOutboundFetch } from "../fetch/outbound.js";

const restoreNode = installNodeGlobals();
let restoreWeb: (() => void) | undefined;
try {
  restoreWeb = installWebGlobals();
  // This entry runs only inside the dedicated Worker, after the native relay.
  globalThis.fetch = createOutboundFetch() as unknown as typeof fetch;
} catch (error) {
  restoreWeb?.();
  restoreNode();
  throw error;
}
