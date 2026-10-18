import type { WorkerSource } from "./runtime/fetch/types.js";

// Build integrations replace this module, without changing the public import.
// The unbundled ESM distribution requires an explicit worker option.
const worker: WorkerSource<unknown> | undefined = undefined;
export default worker;
