import { installNodeGlobals } from "./index.js";

// Legacy unconfigured browser bundles need Node names before static imports.
// Web API ownership belongs to the runtime and is never installed here.
installNodeGlobals();
