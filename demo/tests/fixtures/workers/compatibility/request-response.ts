import { runContract } from "cf-workers-mobile/shared/contracts/testing";
import { Request as LocalRequest } from "../../../../../src/browser/request";
import { Response as LocalResponse } from "../../../../../src/browser/response";
import {
  RequestImplementation,
  requestContract,
} from "../../../../../src/browser/request/index.spec";
import {
  ResponseImplementation,
  responseContract,
} from "../../../../../src/browser/response/index.spec";
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
