import { runContract } from "@rdlabo/workers-capacitor/testing";
import {
  EncodingImplementation,
  encodingContract,
} from "../../../../../src/browser/encoding/index.spec";
import {
  AbortImplementation,
  abortContract,
} from "../../../../../src/browser/abort/index.spec";
export default {
  async fetch(request: Request) {
    switch (new URL(request.url).pathname) {
      case "/encoding":
        return Response.json(
          await runContract(new EncodingImplementation(), encodingContract),
        );
      case "/abort":
        return Response.json(
          await runContract(
            new AbortImplementation({ AbortController, AbortSignal }),
            abortContract,
          ),
        );
      default:
        return new Response("Not found", { status: 404 });
    }
  },
};
