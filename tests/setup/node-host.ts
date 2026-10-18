import { types } from "node:util";

// Node 22 is the tooling host, not the supported WebView runtime. Provide its
// intrinsic error-brand check where it lacks the newer standard spelling.
// This setup is NOT used by browser, workerd or installed-package acceptance.
// Do not substitute instanceof/toString: they misclassify cross-realm errors
// or spoofed brands. Target runtimes must supply Error.isError themselves.
if (!("isError" in Error)) {
  Object.defineProperty(Error, "isError", {
    value: types.isNativeError,
    configurable: true,
    writable: true,
  });
}
