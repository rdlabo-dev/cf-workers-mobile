import { runContract } from "@rdlabo/capacitor-workers/testing";
import { Request as LocalRequest } from "../../../../../src/compat/request";
import { Response as LocalResponse } from "../../../../../src/compat/response";
import {
  RequestImplementation,
  requestContract,
} from "../../../../../src/compat/request/index.spec";
import {
  ResponseImplementation,
  responseContract,
} from "../../../../../src/compat/response/index.spec";
export default {
  async fetch() {
    return Response.json({
      request: await runContract(
        new RequestImplementation(Request as unknown as typeof LocalRequest),
        requestContract,
      ),
      requestCandidate: await runContract(
        new RequestImplementation(LocalRequest),
        requestContract,
      ),
      response: await runContract(
        new ResponseImplementation(Response as unknown as typeof LocalResponse),
        responseContract,
      ),
      responseCandidate: await runContract(
        new ResponseImplementation(LocalResponse),
        responseContract,
      ),
    });
  },
};
