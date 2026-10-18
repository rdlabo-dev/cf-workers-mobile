# Workers Web Streams adapter

The public module and installed globals share their stream constructors. Stream
callbacks capture the registered async context at construction; starting
AsyncLocalStorage does not replace those constructor identities.

On hosts without readable byte streams (including iOS 26.1), the adapter uses
web-streams-polyfill 4.3.0 for the core stream family. Native compression and
encoding codecs are bridged with backpressure. Request/Response keep body
ownership in the JS stream, using the native body codecs after consumption.
Blob streams use the same family. The fallback is JavaScript only and is
installed/restored through the existing global ownership mechanism.

The dependency is pinned because the body adapter reads its disturbance state.
A missing or changed state fails explicitly. The fallback browser fixture
removes the host byte-stream APIs before module initialization in both the
page and Worker, and runs the regular runtime contracts unchanged.

Whole-module acceptance remains open. The pinned Workers tee cancellation
reason and pending pipeTo abort timing still differ from standard host/ponyfill
streams. Those are implementable differences recorded by the stream-boundary
experiment, not reasons to declare the module complete or technically impossible.
