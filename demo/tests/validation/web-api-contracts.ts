import { workersCapacitor } from "workers-capacitor";
import {
  EncodingImplementation,
  encodingContract,
} from "../../../src/browser/encoding/index.spec";
import {
  AbortImplementation,
  abortContract,
} from "../../../src/browser/abort/index.spec";
import { runContract } from "workers-capacitor/shared/contracts/testing";
import {
  HeadersImplementation,
  headersContract,
} from "../../../src/browser/headers/index.spec";
import { Headers } from "../../../src/browser/headers";
import {
  RequestImplementation,
  requestContract,
} from "../../../src/browser/request/index.spec";
import { Request } from "../../../src/browser/request";
import {
  ResponseImplementation,
  responseContract,
} from "../../../src/browser/response/index.spec";
import { Response } from "../../../src/browser/response";

import {
  ImmediateImplementation,
  immediateContract,
} from "../../../src/compat/immediate/index.spec";
import {
  StructuredCloneImplementation,
  structuredCloneContract,
  localStructuredCloneApi,
} from "../../../src/browser/structured-clone/index.spec";

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

export async function runWebApiContracts(name?: WebApiName) {
  // Standalone API contracts own the same Web globals as an application runtime,
  // including resource-management symbols on older WebViews.
  const runtime = workersCapacitor({
    baseURL: "https://web-contract.invalid",
    worker: { fetch: () => new globalThis.Response(null, { status: 204 }) },
  });
  try {
    return await Promise.all(
      name ? [contracts[name]()] : Object.values(contracts).map((run) => run()),
    );
  } finally {
    await runtime.dispose();
  }
}
