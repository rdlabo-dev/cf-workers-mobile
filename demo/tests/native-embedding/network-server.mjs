import { createServer } from "node:http";
// Deliberately drop an established connection; never change host/device networking.
const server = createServer((request, response) => {
  if (request.url === "/drop") {
    console.log("NETWORK_DROP");
    request.socket.destroy();
  } else {
    console.log("NETWORK_OK");
    response.writeHead(200, {
      "Content-Type": "text/plain",
      "Content-Length": "10",
    });
    response.end("network-ok");
  }
});
server.listen(18764, "127.0.0.1", () => console.log("NETWORK_SERVER_READY"));
