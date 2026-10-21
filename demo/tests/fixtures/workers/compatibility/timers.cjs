const timers = require("node:timers");
const promises = require("node:timers/promises");
module.exports = function commonJsTimers(defaultTimers, defaultPromises) {
  const original = timers.setImmediate;
  const originalClear = timers.clearImmediate;
  const originalPromise = promises.setImmediate;
  const replacement = () => {};
  try {
    timers.setImmediate = replacement;
    timers.clearImmediate = replacement;
    promises.setImmediate = replacement;
    return [
      timers === require("timers"),
      promises === require("timers/promises"),
      timers === defaultTimers,
      promises === defaultPromises,
      timers.promises === promises,
      require("timers").setImmediate === replacement,
      require("timers").clearImmediate === replacement,
      require("timers/promises").setImmediate === replacement,
    ];
  } finally {
    timers.setImmediate = original;
    timers.clearImmediate = originalClear;
    promises.setImmediate = originalPromise;
  }
};
