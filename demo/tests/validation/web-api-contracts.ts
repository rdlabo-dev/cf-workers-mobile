import {
  EncodingImplementation,
  encodingContract,
} from "../../../src/compat/encoding/index.spec";
import {
  AbortImplementation,
  abortContract,
} from "../../../src/compat/abort/index.spec";
import { runContract } from "@rdlabo/capacitor-workers/testing";
import {
  HeadersImplementation,
  headersContract,
} from "../../../src/compat/headers/index.spec";
import { Headers } from "../../../src/compat/headers";
import {
  RequestImplementation,
  requestContract,
} from "../../../src/compat/request/index.spec";
import { Request } from "../../../src/compat/request";
import {
  ResponseImplementation,
  responseContract,
} from "../../../src/compat/response/index.spec";
import { Response } from "../../../src/compat/response";

import {
  ImmediateImplementation,
  immediateContract,
} from "../../../src/compat/immediate/index.spec";
import {
  StructuredCloneImplementation,
  structuredCloneContract,
  localStructuredCloneApi,
} from "../../../src/compat/structured-clone/index.spec";

const contracts = {
  encoding: () => runContract(new EncodingImplementation(), encodingContract),
  abort: () => runContract(new AbortImplementation(), abortContract),
  headers: () =>
    runContract(new HeadersImplementation(Headers), headersContract),
  request: () =>
    runContract(new RequestImplementation(Request), requestContract),
  response: () =>
    runContract(new ResponseImplementation(Response), responseContract),
  immediate: () =>
    runContract(new ImmediateImplementation(), immediateContract),
  structuredClone: () =>
    runContract(
      new StructuredCloneImplementation(localStructuredCloneApi),
      structuredCloneContract,
    ),
};
export type WebApiName = keyof typeof contracts;

export function runWebApiContracts(name?: WebApiName) {
  return Promise.all(
    name ? [contracts[name]()] : Object.values(contracts).map((run) => run()),
  );
}
