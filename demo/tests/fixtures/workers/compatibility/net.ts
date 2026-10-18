import { runContract } from "@rdlabo/capacitor-workers/testing";
import {
  NetImplementation,
  netContract,
  runNetIncomingContract,
  runNetNetworkContract,
} from "../../../../../src/compat/net/index.spec";
import net from "node:net";
import { handleAsNodeConnection, connectHandler } from "cloudflare:node";
export default {
  async fetch(request: Request, env: { UPSTREAM?: string }) {
    if (new URL(request.url).pathname === "/network") {
      await runNetNetworkContract(env.UPSTREAM!);
      return new Response("ok");
    }
    if (new URL(request.url).pathname === "/incoming") {
      for (const accept of [handleAsNodeConnection, connectHandler().connect]) {
        await runNetIncomingContract(net as never, (socket) =>
          accept(socket as never),
        );
      }
      return new Response("ok");
    }
    return Response.json(
      await runContract(new NetImplementation(), netContract),
    );
  },
};
