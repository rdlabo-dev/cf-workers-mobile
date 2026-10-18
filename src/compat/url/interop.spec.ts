import { afterEach, expect, it, vi } from "vitest";
const OriginalURL = globalThis.URL;
const OriginalBlob = globalThis.Blob;
const nativeBlob = Symbol.for("@rdlabo/capacitor-workers/native-blob");
afterEach(() => {
  globalThis.URL = OriginalURL;
  globalThis.Blob = OriginalBlob;
  vi.resetModules();
});
it("formats URLs created before installation and by a separate bundle", async () => {
  const before = new OriginalURL(
    "https://user:pass@xn--r8jz45g.xn--zckzah/a?q=1#x",
  );
  const first = await import("./index.js");
  globalThis.URL = first.URL;
  const prior = new first.URL(before.href);
  vi.resetModules();
  const second = await import("./index.js");
  for (const value of [before, prior])
    expect(
      second.format(value, {
        auth: false,
        search: false,
        fragment: false,
        unicode: true,
      }),
    ).toBe("https://例え.テスト/a");
});
it("loads after another bundle has installed a Blob subclass", async () => {
  class AdaptedBlob extends OriginalBlob {}
  Object.defineProperty(AdaptedBlob, nativeBlob, { value: OriginalBlob });
  globalThis.Blob = AdaptedBlob;
  vi.resetModules();
  const api = await import("./index.js");
  expect(() => api.URL.createObjectURL(new AdaptedBlob())).toThrow(
    "URL.createObjectURL() is not implemented",
  );
  expect(() => Reflect.apply(api.URL.createObjectURL, api.URL, [{}])).toThrow(
    TypeError,
  );
});
