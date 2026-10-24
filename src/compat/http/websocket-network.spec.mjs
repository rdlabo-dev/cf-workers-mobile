export async function runWebSocketLifecycle(WebSocket, ports) {
  const results = {};
  for (const [scheme, port] of [
    ["ws", ports.http],
    ["wss", ports.https],
  ]) {
    for (const closeBy of ["client", "server"]) {
      results[`${scheme}/${closeBy}`] = await new Promise((resolve, reject) => {
        const socket = new WebSocket(
          `${scheme}://127.0.0.1:${port}/websocket`,
          ["compat"],
        );
        socket.binaryType = "arraybuffer";
        const messages = [],
          events = [];
        const timer = setTimeout(() => {
          socket.close();
          reject(new Error(`WebSocket timeout: ${scheme}/${closeBy}`));
        }, 5000);
        socket.addEventListener("open", () => {
          events.push("open");
          socket.send("text");
          socket.send(new Uint8Array([1, 2, 255]));
        });
        socket.addEventListener("message", (event) => {
          messages.push(
            typeof event.data === "string"
              ? event.data
              : Array.from(new Uint8Array(event.data)),
          );
          if (messages.length === 2) {
            if (closeBy === "client") socket.close(1000, "done");
            else socket.send("close-me");
          }
        });
        socket.addEventListener("error", () => events.push("error"));
        socket.addEventListener("close", (event) => {
          clearTimeout(timer);
          resolve({
            protocol: socket.protocol,
            binaryType: socket.binaryType,
            readyState: socket.readyState,
            messages,
            events,
            close: {
              code: event.code,
              reason: event.reason,
              clean: event.wasClean,
            },
          });
        });
      });
    }
  }
  return results;
}
