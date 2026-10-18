// Generated Worker bundles can retain builtin require calls inside ESM.
import { AsyncLocalStorage as ImportedStorage } from "node:async_hooks";
const { AsyncLocalStorage } = require("node:async_hooks");
const assert = require("node:assert");
export function mixedModule() {
  globalThis.self = globalThis;
  assert.equal(self, globalThis);
  const storage = new AsyncLocalStorage();
  return storage.run("mixed", () => {
    assert.equal(storage.getStore(), "mixed");
    return AsyncLocalStorage === ImportedStorage;
  });
}
