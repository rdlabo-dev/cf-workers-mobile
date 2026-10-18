// @ts-expect-error JavaScript fixture deliberately mixes module formats.
import { mixedModule } from "./mixed.mjs";
// @ts-expect-error This fixture deliberately exercises a CommonJS require entry.
import commonJsAssertions from "./assert.cjs";
// @ts-expect-error This fixture verifies CommonJS constructor exports.
import commonJsStreams from "./stream.cjs";
// Type-only views: execution must use the installed public globals.
const { Headers, Request } = globalThis as unknown as {
  Headers: typeof import("../../../../../src/browser/headers").Headers;
  Request: typeof import("../../../../../src/browser/request").Request;
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
      commonJsAssertions: commonJsAssertions(),
      commonJsStreams: commonJsStreams(),
      mixedModule: mixedModule(),
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
