import { defineConfig, type Plugin } from "vite";
import { fileURLToPath } from "node:url";
import base from "./vite.config";
const forceByteStreamFallback = (): Plugin => ({
  name: "test-native-byte-stream-absence",
  renderChunk(code) {
    return `if (!globalThis[Symbol.for("test.streamsFallback")]) {
      globalThis[Symbol.for("test.streamsFallback")] = true;
      delete globalThis.ReadableByteStreamController;
      delete globalThis.ReadableStreamBYOBReader;
      delete globalThis.ReadableStreamBYOBRequest;
    }\n${code}`;
  },
});
export default defineConfig({
  ...base,
  plugins: [...(base.plugins ?? []), forceByteStreamFallback()],
  worker: { plugins: () => [forceByteStreamFallback()] },
  build: {
    ...base.build,
    outDir: fileURLToPath(
      new URL("../../../../artifacts/stream-fallback", import.meta.url),
    ),
  },
});
