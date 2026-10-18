import kvWorker from "./kv";
import { runContract } from "@rdlabo/workers-capacitor/testing";
import { kvContract } from "@rdlabo/workers-capacitor/testing/kv";
import type { KVNamespace } from "@rdlabo/workers-capacitor/features/kv";
import { wasmContract } from "../../../validation/contracts/wasm";
import {
  WorkersText,
  WasmValidation,
} from "../../../validation/implementations";
export default {
  async fetch(_request: Request, env: { TEXT: KVNamespace }) {
    if (new URL(_request.url).pathname === "/expiration") {
      if (_request.method === "PUT") {
        await env.TEXT.put("expires", "value", {
          expirationTtl: 60,
          metadata: { test: true },
        });
        return new Response(null, { status: 204 });
      }
      return Response.json({
        value: await env.TEXT.get("expires"),
        metadata: await env.TEXT.getWithMetadata("expires"),
        listing: await env.TEXT.list({ prefix: "expires" }),
      });
    }
    if (new URL(_request.url).pathname === "/kv")
      return kvWorker.fetch(_request, { KV: env.TEXT });
    return Response.json([
      await runContract(new WorkersText(env.TEXT), kvContract),
      await runContract(new WasmValidation(), wasmContract),
    ]);
  },
};
