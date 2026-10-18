// Type-only views: execution must use the installed public globals.
const { Headers, Request } = globalThis as unknown as {
  Headers: typeof import("../../../../../src/compat/headers").Headers;
  Request: typeof import("../../../../../src/compat/request").Request;
};
import { runNodeContracts } from "../../../validation/node-modules";
import { nodeGlobals } from "./node-globals";
import { staticWebGlobals } from "./web-globals-static";
const topLevelWebGlobals = [
  new Headers([["set-cookie", "entry=1"]]).getAll("set-cookie"),
  new Request("https://example.test", { cf: { marker: "entry" } }).cf,
];

// Runs the node contracts inside the configured Worker bundle so bundled
// resolution and Dedicated Worker execution are covered without relying on
// bundler-specific Worker entry transforms.
export default {
  async fetch() {
    return Response.json({
      contracts: await runNodeContracts("bundled"),
      webGlobals: {
        entry: topLevelWebGlobals,
        static: staticWebGlobals,
        dynamic: (await import("./web-globals-dynamic")).dynamicWebGlobals,
      },
      globals: {
        ...nodeGlobals,
        dynamic: await nodeGlobals.dynamic(),
      },
    });
  },
};
