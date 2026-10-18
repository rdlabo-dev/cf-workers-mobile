const stream = require("node:stream");
const readable = require("node:_stream_readable");
const writable = require("node:_stream_writable");
const duplex = require("node:_stream_duplex");
const transform = require("node:_stream_transform");
const passthrough = require("node:_stream_passthrough");
module.exports = function commonJsStreams() {
  const r = readable.from([1]);
  r.destroy();
  return [
    typeof stream === "function",
    stream === stream.Stream,
    readable === stream.Readable,
    writable === stream.Writable,
    duplex === stream.Duplex,
    transform === stream.Transform,
    passthrough === stream.PassThrough,
  ];
};
