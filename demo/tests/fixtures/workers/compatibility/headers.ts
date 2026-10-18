import { runContract } from "@rdlabo/capacitor-workers/testing";
import {
  headersContract,
  HeadersImplementation,
} from "../../../../../src/compat/headers/index.spec";
import { Headers as LocalHeaders } from "../../../../../src/compat/headers";

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
