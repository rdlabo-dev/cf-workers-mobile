import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createServer } from "node:https";

export const directory = fileURLToPath(
  new URL("../../../artifacts/network-tls/", import.meta.url),
);
export function createTlsFixtures() {
  mkdirSync(directory, { recursive: true });
  const run = (...args) =>
    execFileSync("openssl", args, { cwd: directory, stdio: "pipe" });
  run(
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    "ca.key",
    "-out",
    "ca.pem",
    "-days",
    "2",
    "-subj",
    "/CN=Capacitor Workers Local Test CA",
    "-addext",
    "basicConstraints=critical,CA:TRUE",
    "-addext",
    "keyUsage=critical,keyCertSign,cRLSign",
  );
  for (const [name, san] of [
    ["valid", "DNS:localhost,IP:127.0.0.1,IP:10.0.2.2"],
    ["hostname", "DNS:wrong.invalid"],
  ]) {
    run(
      "req",
      "-new",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      `${name}.key`,
      "-out",
      `${name}.csr`,
      "-subj",
      `/CN=${name}.invalid`,
    );
    writeFileSync(
      join(directory, `${name}.ext`),
      `subjectAltName=${san}\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n`,
    );
    run(
      "x509",
      "-req",
      "-in",
      `${name}.csr`,
      "-CA",
      "ca.pem",
      "-CAkey",
      "ca.key",
      "-CAcreateserial",
      "-out",
      `${name}.pem`,
      "-days",
      "2",
      "-extfile",
      `${name}.ext`,
    );
  }
  run(
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    "untrusted.key",
    "-out",
    "untrusted.pem",
    "-days",
    "2",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:10.0.2.2",
  );
  return ["valid", "untrusted", "hostname"].map((name, index) => {
    const server = createServer(
      {
        key: readFileSync(join(directory, `${name}.key`)),
        cert: readFileSync(join(directory, `${name}.pem`)),
      },
      (request, response) => {
        if (["/unclean-eof", "/clean-eof"].includes(request.url)) {
          const socket = response.socket;
          // No content length/chunk terminator: TLS close_notify must distinguish
          // a complete response from a truncated authenticated connection.
          socket.write(
            "HTTP/1.1 200 OK\r\nConnection: close\r\n\r\nprefix",
            () =>
              request.url === "/unclean-eof" ? socket.destroy() : socket.end(),
          );
        } else response.end("local TLS fixture");
      },
    );
    server.listen(4204 + index, "0.0.0.0");
    return server;
  });
}
