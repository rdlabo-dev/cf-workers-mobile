// Type-only views: execution must use the installed public globals.
const { Headers, Request } = globalThis as unknown as {
  Headers: typeof import("../../../../../src/compat/headers").Headers;
  Request: typeof import("../../../../../src/compat/request").Request;
};
// Evaluated before the configured Worker module body.
export const staticWebGlobals = [
  new Headers([["set-cookie", "static=1"]]).getAll("set-cookie"),
  new Request("https://example.test", { cf: { marker: "static" } }).cf,
];
