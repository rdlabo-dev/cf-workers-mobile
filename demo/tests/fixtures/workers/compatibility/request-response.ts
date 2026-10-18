import { runContract } from "@rdlabo/workers-capacitor/testing";
import { Request as LocalRequest } from "../../../../../src/compat/web/request";
import { Response as LocalResponse } from "../../../../../src/compat/web/response";
import {
  RequestImplementation,
  requestContract,
} from "../../../../../src/compat/web/request/index.spec";
import {
  ResponseImplementation,
  responseContract,
} from "../../../../../src/compat/web/response/index.spec";
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
