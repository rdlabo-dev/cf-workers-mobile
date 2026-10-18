import { it } from "vitest";
import { assertContract, runContract } from "../../src/features/testing.js";
import {
  NetImplementation,
  netContract,
} from "../../src/compat/net/index.spec.js";
import net from "../../src/compat/net/index.js";
it("satisfies the shared net contract", async () => {
  assertContract(await runContract(new NetImplementation(net), netContract));
});
import { runNetIncomingContract } from "../../src/compat/net/index.spec.js";
import { handleAsNodeConnection } from "../../src/compat/cloudflare-node/index.js";
it("accepts TCP through the public bridge and server", async () => {
  await runNetIncomingContract(net, (socket) =>
    handleAsNodeConnection(
      socket as Parameters<typeof handleAsNodeConnection>[0],
    ),
  );
});
import * as namespace from "../../src/compat/net/index.js";
import { expect } from "vitest";
it("exports only the pinned public facade and identical named exports", () => {
  expect(Object.keys(namespace).sort()).toEqual(
    [...Object.keys(net), "default"].sort(),
  );
  for (const key of Object.keys(net) as (keyof typeof net)[])
    expect(namespace[key]).toBe(net[key]);
});
import { createServer as createHTTPServer } from "../../src/compat/http/index.js";
it("shares exclusive logical port ownership between HTTP and net", () => {
  const reservation = new net.BoundSocket({ port: 34110 });
  const http = createHTTPServer(() => {});
  try {
    expect(() => http.listen(34110)).toThrow();
  } finally {
    reservation.close();
  }
  http.listen(34110);
  try {
    expect(() => new net.BoundSocket({ port: 34110 })).toThrow();
  } finally {
    http.close();
  }
  const reused = new net.BoundSocket({ port: 34110 });
  reused.close();
});
