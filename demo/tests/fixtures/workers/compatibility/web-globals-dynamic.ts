// Type-only views: execution must use the installed public globals.
const { Headers, Request } = globalThis as unknown as {
  Headers: typeof import("../../../../../src/compat/headers").Headers;
  Request: typeof import("../../../../../src/compat/request").Request;
};
export const dynamicWebGlobals = [
  new Headers([["set-cookie", "dynamic=1"]]).getAll("set-cookie"),
  new Request("https://example.test", { cf: { marker: "dynamic" } }).cf,
];
