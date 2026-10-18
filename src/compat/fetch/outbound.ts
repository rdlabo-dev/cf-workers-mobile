import { createFetch } from "./index.js";
import { browserFetch } from "./interop.js";
import { createNativeNetwork, getNativeCall } from "./native-network.js";
import { FetchTransport } from "./transport.js";

/** Capture the owning native scope once; never rediscover a replacement runtime. */
export function createOutboundFetch(
  browserTransport?: typeof globalThis.fetch,
) {
  const call = getNativeCall();
  return call
    ? createFetch(new FetchTransport(createNativeNetwork({ nativeCall: call })))
    : (
        input: Parameters<typeof browserFetch>[0],
        init?: Parameters<typeof browserFetch>[1],
      ) => browserFetch(input, init, browserTransport);
}
