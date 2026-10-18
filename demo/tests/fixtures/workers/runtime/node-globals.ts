import { nodeGlobals } from "../compatibility/node-globals";
import worker from "./isolation";

export default {
  async fetch(...args: Parameters<typeof worker.fetch>) {
    if (new URL(args[0].url).pathname === "/api/node-globals")
      return Response.json({
        ...nodeGlobals,
        dynamic: await nodeGlobals.dynamic(),
      });
    return worker.fetch(...args);
  },
};
