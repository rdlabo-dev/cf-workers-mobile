const assert = require("node:assert");
const strict = require("node:assert/strict");
module.exports = function commonJsAssertions() {
  assert(true);
  assert.deepStrictEqual({ nested: [1] }, { nested: [1] });
  strict(true);
  return {
    callable: typeof assert === "function",
    sameDefault: assert === strict,
  };
};
