import { runContract } from "@rdlabo/workers-capacitor/shared/contracts/testing";
import {
  headersContract,
  HeadersImplementation,
} from "../../../../../src/browser/headers/index.spec";
import { Headers as LocalHeaders } from "../../../../../src/browser/headers";

export default {
  async fetch() {
    return Response.json({
      baseline: await runContract(
        new HeadersImplementation(Headers as unknown as typeof LocalHeaders),
        headersContract,
      ),
      candidate: await runContract(
        new HeadersImplementation(LocalHeaders),
        headersContract,
      ),
    });
  },
};
