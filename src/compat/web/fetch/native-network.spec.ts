import { describe, expect, it, vi } from "vitest";
import { createNativeNetwork, type NativeCall } from "./native-network.js";
const request = {
  url: "https://example.invalid/path?q=1",
  method: "GET",
  headers: [] as [string, string][],
  hasBody: false,
};
function bridge(
  parts: Array<{ chunk?: string; eof?: boolean; reset?: boolean }>,
) {
  const call = vi.fn<NativeCall>(async (_, method) => {
    if (method === "socketRead") return parts.shift() ?? { eof: true };
  });
  return { call, network: createNativeNetwork({ nativeCall: call }) };
}
const chunk = (text: string) => ({ chunk: btoa(text) });
describe("HTTP over native bytes", () => {
  it("continues bounded upload after response headers until the response completes", async () => {
    const { call, network } = bridge([
      chunk("HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\n"),
      chunk("hello"),
    ]);
    const connection = await network.open({
      ...request,
      method: "POST",
      hasBody: true,
    });
    await connection.headers;
    await connection.write(new Uint8Array(131073).fill(65));
    await connection.end();
    const writes = call.mock.calls
      .filter(([, method]) => method === "socketWrite")
      .map(([, , args]) => atob(args.chunk as string));
    expect(writes.every((value) => value.length <= 65536)).toBe(true);
    expect(
      writes
        .filter((value) => /^A+$/.test(value))
        .reduce((sum, value) => sum + value.length, 0),
    ).toBe(131073);
    expect(new TextDecoder().decode((await connection.read())!)).toBe("hello");
    expect(await connection.read()).toBeNull();
    await connection.close();
  });
  it.each([
    { ...request, url: "ftp://example.invalid" },
    { ...request, method: "GET\r\nInjected: 1" },
    {
      ...request,
      headers: [["Host", "a\r\nInjected: 1"]] as [string, string][],
    },
    { ...request, headers: [["Content-Length", "5x"]] as [string, string][] },
  ])("rejects invalid request before opening a socket %#", async (value) => {
    const { call, network } = bridge([]);
    await expect(network.open(value)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });
  it("parses headers independently of upload and preserves raw body bytes", async () => {
    const { call, network } = bridge([
      chunk(
        "HTTP/1.1 200 OK\r\nSet-Cookie: a=1\r\nSet-Cookie: b=2\r\nContent-Length: 2\r\n\r\n\x00\xff",
      ),
    ]);
    const connection = await network.open({
      ...request,
      method: "POST",
      hasBody: true,
    });
    expect((await connection.headers).headers).toContainEqual([
      "Set-Cookie",
      "b=2",
    ]);
    expect(Array.from((await connection.read())!)).toEqual([0, 255]);
    expect(await connection.read()).toBeNull();
    await connection.close();
    expect(call.mock.calls[0]).toMatchObject([
      "WorkersCapacitor",
      "socketOpen",
      { host: "example.invalid", port: 443, tls: true },
    ]);
    expect(
      call.mock.calls.filter(([, method]) => method === "socketClose"),
    ).toHaveLength(1);
  });
  it("serializes chunked uploads in bounded socket writes", async () => {
    let deliver!: (result: unknown) => void;
    const response = new Promise((resolve) => {
      deliver = resolve;
    });
    const call = vi.fn<NativeCall>(async (_, method) =>
      method === "socketRead" ? response : undefined,
    );
    const network = createNativeNetwork({ nativeCall: call });
    const connection = await network.open({
      ...request,
      method: "POST",
      hasBody: true,
    });
    await connection.write(new Uint8Array([1, 2, 3]));
    await connection.end();
    const wire = call.mock.calls
      .filter(([, method]) => method === "socketWrite")
      .map(([, , args]) => atob(args.chunk as string))
      .join("");
    expect(wire).toContain("POST /path?q=1 HTTP/1.1\r\n");
    expect(wire).toContain("Transfer-Encoding: chunked\r\n");
    expect(wire).toContain("\r\n\r\n3\r\n\x01\x02\x03\r\n0\r\n\r\n");
    deliver(chunk("HTTP/1.1 204 No Content\r\n\r\n"));
    await connection.headers;
    await connection.close();
  });
  it("rejects reset rather than treating a close-delimited body as complete", async () => {
    const { network } = bridge([
      chunk("HTTP/1.1 200 OK\r\n\r\nhello"),
      { eof: true, reset: true },
    ]);
    const connection = await network.open(request);
    await connection.headers;
    await connection.read();
    await expect(connection.read()).rejects.toThrow("reset");
    await connection.close();
  });
  it.each(["http:", "https:"])(
    "handles close-delimited %s bodies explicitly",
    async (protocol) => {
      const { network } = bridge([chunk("HTTP/1.1 200 OK\r\n\r\nhello")]);
      const connection = await network.open({
        ...request,
        url: `${protocol}//example.invalid/`,
      });
      await connection.headers;
      expect(new TextDecoder().decode((await connection.read())!)).toBe(
        "hello",
      );
      if (protocol === "https:")
        await expect(connection.read()).rejects.toThrow("TLS EOF");
      else expect(await connection.read()).toBeNull();
      await connection.close();
    },
  );
  it("rejects truncated body", async () => {
    const { network } = bridge([
      chunk("HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhi"),
    ]);
    const connection = await network.open(request);
    await connection.headers;
    await connection.read();
    await expect(connection.read()).rejects.toThrow();
    await connection.close();
  });
  it("awaits idempotent native cleanup and propagates its failure", async () => {
    const { call, network } = bridge([
      chunk("HTTP/1.1 204 No Content\r\n\r\n"),
    ]);
    const connection = await network.open(request);
    await connection.headers;
    call.mockImplementation(async (_, method) => {
      if (method === "socketClose") throw Error("cleanup");
    });
    const closing = connection.close();
    expect(connection.close()).toBe(closing);
    await expect(closing).rejects.toThrow("cleanup");
  });
  it("bounds read requests and rejects invalid size", () => {
    expect(() =>
      createNativeNetwork({ nativeCall: vi.fn(), chunkSize: 65537 }),
    ).toThrow();
  });
});
