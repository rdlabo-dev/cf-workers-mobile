import { afterEach, expect, it, vi } from "vitest";
import {
  assertLocalRuntime,
  getExecutionEnvironment,
} from "../../src/environment";
afterEach(() => vi.unstubAllGlobals());
it("distinguishes Cloudflare Workers from browser Workers before installing compatibility globals", () => {
  vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
  expect(getExecutionEnvironment()).toBe("cloudflare-workers");
  expect(assertLocalRuntime).toThrow("original Worker handler");
  vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0" });
  vi.stubGlobal("Worker", class {});
  expect(getExecutionEnvironment()).not.toBe("cloudflare-workers");
  expect(assertLocalRuntime).not.toThrow();
});
it("identifies a native Capacitor host without treating every browser as native", () => {
  vi.stubGlobal("Capacitor", { isNativePlatform: () => true });
  expect(getExecutionEnvironment()).toBe("capacitor");
});
