import { expect, it } from "vitest";
import { platform } from "../globals/platform.js";
import { installWebGlobals } from "../globals/web.js";
import { Request } from "../request/index.js";
import { isRequest, isResponse, browserFetch } from "./interop.js";

it("accepts pre-installation Request and saved Response constructors without cloning bodies", async () => {
  const source = new platform.Request("https://example.invalid/", {
    method: "POST",
    body: "payload",
  });
  const NativeResponse = platform.Response;
  const restore = installWebGlobals();
  try {
    expect(isRequest(source)).toBe(true);
    const converted = new Request(source);
    expect(source.bodyUsed).toBe(true);
    expect(await converted.text()).toBe("payload");
    const response = new NativeResponse("saved constructor");
    expect(isResponse(response)).toBe(true);
    expect(await response.text()).toBe("saved constructor");
    expect(isResponse({ status: 200, body: null })).toBe(false);
  } finally {
    restore();
  }
});
it("an explicit replacement body does not consume a pre-existing Request", async () => {
  const source = new platform.Request("https://example.invalid/", {
    method: "POST",
    body: "original",
  });
  expect(await new Request(source, { body: "replacement" }).text()).toBe(
    "replacement",
  );
  expect(await source.text()).toBe("original");
});
it("browser fallback bypasses the installed router and returns a compatible Response", async () => {
  const restore = installWebGlobals();
  try {
    const response = await browserFetch(new Request("data:text/plain,body"));
    expect(response).toBeInstanceOf(globalThis.Response);
    expect(await response.text()).toBe("body");
  } finally {
    restore();
  }
});
it("resolves browser-relative fallback URLs against the document base", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { baseURI: "https://app.invalid/assets/" },
  });
  try {
    let address: unknown;
    const response = await browserFetch(
      "../outside.txt",
      undefined,
      async (input) => {
        address = input;
        return new platform.Response("asset");
      },
    );
    expect(address).toBe("https://app.invalid/outside.txt");
    expect(await response.text()).toBe("asset");
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
it("invalid initializers do not consume existing platform Request bodies", async () => {
  for (const init of [
    { cf: 5 },
    { method: "GET" },
    { headers: { "bad name": "value" } },
  ]) {
    const source = new platform.Request("https://example.invalid/", {
      method: "POST",
      body: "original",
    });
    expect(() => new Request(source, init as never)).toThrow();
    expect(source.bodyUsed).toBe(false);
    expect(source.body?.locked).toBe(false);
    expect(await source.text()).toBe("original");
  }
});
