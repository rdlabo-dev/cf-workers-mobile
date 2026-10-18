import { expect, it } from "vitest";
import { installWebGlobals } from "../globals/web.js";
import { platform } from "../globals/platform.js";

it("body codecs do not recurse through the installed Response", async () => {
  const restore = installWebGlobals();
  try {
    const response = new globalThis.Response("body");
    expect(await response.text()).toBe("body");
    expect(platform.Response).not.toBe(globalThis.Response);
  } finally {
    restore();
  }
  expect(globalThis.Response).toBe(platform.Response);
});
