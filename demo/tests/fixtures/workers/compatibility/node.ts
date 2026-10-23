import { runNodeContracts } from "../../../validation/node-modules-core";

// Real workerd resolves the node:* imports in node-modules to its builtins;
// the same contract suites then run as in the browser profiles.
export default {
  async fetch() {
    return Response.json(await runNodeContracts("workers"));
  },
};
