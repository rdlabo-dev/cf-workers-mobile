// CommonJS builtins expose a shared mutable object, not an ESM namespace.
module.exports = require("./index.js").default;
