# Workers Web Streams adapter

The public module and installed globals share their stream constructors. Stream
callbacks capture the registered async context at construction; starting
AsyncLocalStorage does not replace those constructor identities.

Every host uses the packaged web-streams-polyfill 4.3.0 implementation with
pinned Workers cancellation patches. Tee cancellation forwards the last branch's
reason. Abort during a pending pipeTo read waits for that read to settle, discards
the arriving chunk, and cancels the source before aborting the destination.
The differential profile covers default/byte tee and preventCancel/preventAbort.

Native compression and encoding codecs are bridged with backpressure.
Request/Response keep body ownership in the JS stream, using native body codecs
after consumption. Pre-installation native Request bodies transfer through a
captured native TransformStream before bridging. Blob streams use the same
owned family. Global installation/restoration retains the ownership mechanism.

The dependency is pinned because the body adapter reads its disturbance state.
A missing or changed state fails explicitly. The fallback browser fixture
removes the host byte-stream APIs before initialization in page and Worker,
and runs the regular runtime contracts unchanged.

Rebuild the checked-in implementation with scripts/build-workers-streams.mjs.
The adjacent build manifest records the upstream revision, patched source hashes
and generated artifact hash. Raw-host boundary probes remain useful counterexamples
to host forwarding; they are not the adapter's acceptance tests. Whole-module
acceptance remains open beyond these verified operations.
