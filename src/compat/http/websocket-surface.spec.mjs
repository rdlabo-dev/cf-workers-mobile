export function runWebSocketSurface() {
  const attempt = (fn) => {
    try {
      const value = fn();
      return { ok: true, value: value === undefined ? "undefined" : value };
    } catch (e) {
      return {
        ok: false,
        name: e.name,
        message: e.message,
        code: e.code ?? null,
      };
    }
  };
  const out = {
    surface: {
      constructor: typeof WebSocket,
      pair: typeof WebSocketPair,
      prototype: Object.getOwnPropertyNames(WebSocket.prototype).sort(),
      methods: Object.fromEntries(
        [
          "accept",
          "send",
          "close",
          "serializeAttachment",
          "deserializeAttachment",
        ].map((k) => [k, typeof WebSocket.prototype[k]]),
      ),
    },
    constructors: [],
  };
  for (const [id, args] of [
    ["invalid", ["not a url"]],
    ["http", ["http://localhost/"]],
    ["fragment", ["ws://localhost/#x"]],
    ["duplicate", ["ws://localhost/", ["a", "a"]]],
  ])
    out.constructors.push({
      id,
      result: attempt(() => {
        const ws = new WebSocket(...args);
        ws.addEventListener("error", () => {});
        ws.close();
        return "created";
      }),
    });
  out.pair = attempt(() => {
    const p = new WebSocketPair(),
      a = p[0],
      b = p[1],
      v = { stateBefore: [a.readyState, b.readyState], keys: Object.keys(p) };
    v.sendBefore = attempt(() => a.send("before"));
    v.accept = attempt(() => a.accept());
    v.repeatAccept = attempt(() => a.accept());
    v.emptyAttachment = attempt(() => a.deserializeAttachment());
    const attachment = { x: { n: 1 }, bytes: new Uint8Array([1, 2]) };
    v.serialize = attempt(() => a.serializeAttachment(attachment));
    attachment.x.n = 2;
    attachment.bytes[0] = 9;
    const first = a.deserializeAttachment();
    v.clone = { n: first.x.n, bytes: Array.from(first.bytes) };
    first.x.n = 3;
    v.cloneAgain = a.deserializeAttachment().x.n;
    v.missing = attempt(() => a.serializeAttachment());
    v.afterMissing = attempt(() => a.deserializeAttachment());
    v.function = attempt(() => a.serializeAttachment(() => {}));
    v.stateAfter = [a.readyState, b.readyState];
    a.close();
    b.accept();
    b.close();
    return v;
  });
  return out;
}
