import { describe, expect, it } from "vitest";
import { HttpResponseParser } from "./index.js";
const cases = [
  ["length", "HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello", "hello"],
  [
    "chunked",
    "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n0\r\nX-Trailer: yes\r\n\r\n",
    "hello",
  ],
  [
    "interim",
    "HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello",
    "hello",
  ],
  ["EOF", "HTTP/1.1 200 OK\r\nConnection: close\r\n\r\nhello", "hello"],
  ["204", "HTTP/1.1 204 No Content\r\n\r\n", ""],
  ["304", "HTTP/1.1 304 Not Modified\r\n\r\n", ""],
];
const invalid = [
  "HTTP/1.1 200 OK\r\nContent-Length: 5x\r\n\r\nhello",
  "HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhi",
  "HTTP/1.1 200 OK\r\nContent-Length: 1\r\nContent-Length: 2\r\n\r\na",
  "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5x\r\nhello\r\n0\r\n\r\n",
  "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhi",
  "HTTP/1.1 200 OK\r\nContent-Length: 5\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n",
  "HTTP/1.1 100 Continue\r\n\r\n",
  "HTTP/1.1 101 Switching Protocols\r\nConnection: upgrade\r\nUpgrade: websocket\r\n\r\n",
];
function feed(parser: HttpResponseParser, text: string, size: number) {
  const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0));
  for (let i = 0; i < bytes.length; i += size)
    parser.feed(bytes.subarray(i, i + size));
  parser.finish();
}
describe.each([1, 7, 65536])("HTTP parser fragmented at %i bytes", (size) => {
  it.each(cases)("parses %s", (_, wire, expected) => {
    const parser = new HttpResponseParser("GET");
    try {
      feed(parser, wire, size);
      expect(parser.complete).toBe(true);
      expect(
        parser.chunks.map((c) => new TextDecoder().decode(c)).join(""),
      ).toBe(expected);
    } finally {
      parser.dispose();
    }
  });
  it.each(invalid)("rejects malformed or unsupported response %#", (wire) => {
    const parser = new HttpResponseParser("GET");
    try {
      expect(() => feed(parser, wire, size)).toThrow();
    } finally {
      parser.dispose();
    }
  });
  it("preserves duplicate cookies and byte-valued headers", () => {
    const parser = new HttpResponseParser("HEAD");
    try {
      feed(
        parser,
        "HTTP/1.1 200 OK\r\nSet-Cookie: a=1\r\nSet-Cookie: b=2\r\nContent-Length: 999\r\n\r\n",
        size,
      );
      expect(parser.head?.headers).toEqual([
        ["Set-Cookie", "a=1"],
        ["Set-Cookie", "b=2"],
        ["Content-Length", "999"],
      ]);
      expect(parser.head?.hasBody).toBe(false);
    } finally {
      parser.dispose();
    }
  });
});
it("bounds headers across fragments", () => {
  const parser = new HttpResponseParser("GET");
  try {
    expect(() =>
      feed(
        parser,
        `HTTP/1.1 200 OK\r\nX-Large: ${"x".repeat(65537)}\r\n\r\n`,
        1024,
      ),
    ).toThrow("64 KiB");
  } finally {
    parser.dispose();
  }
});
it("keeps trailers separate from published headers and preserves Latin-1 bytes", () => {
  const parser = new HttpResponseParser("GET");
  try {
    feed(
      parser,
      "HTTP/1.1 200 OK\r\nX-Latin: \xff\r\nTransfer-Encoding: chunked\r\n\r\n0\r\nX-Trailer: yes\r\n\r\n",
      1,
    );
    expect(parser.head?.headers).toEqual([
      ["X-Latin", "\xff"],
      ["Transfer-Encoding", "chunked"],
    ]);
  } finally {
    parser.dispose();
  }
});
