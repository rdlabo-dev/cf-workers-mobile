const Module = require("node:module");
module.exports = function commonJsModule(defaultModule) {
  const original = Module.prototype.require;
  const replacement = () => "hooked";
  try {
    Module.prototype.require = replacement;
    const sharedHook = new (require("module"))().require("unused") === "hooked";
    let rejectsExecutable = false;
    try {
      original.call(new Module(), "./page.js");
    } catch (error) {
      rejectsExecutable = String(error).includes(
        "executable modules must be bundled",
      );
    }
    return [
      Module === require("module"),
      Module === defaultModule,
      Module.Module === Module,
      sharedHook,
      rejectsExecutable,
    ];
  } finally {
    Module.prototype.require = original;
  }
};
