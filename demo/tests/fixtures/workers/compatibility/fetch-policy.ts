import * as nodeHttp from "node:http";
import * as localHttp from "../../../../../src/compat/http";
import { nodeHttpNetworkContract } from "../../../../../src/compat/http/index.spec";
import { runContract } from "@rdlabo/capacitor-workers/testing";
import {
  FetchPolicyImplementation,
  fetchPolicyContract,
} from "../../../../../src/compat/fetch/policy.spec";
import { createFetch } from "../../../../../src/compat/fetch";
import { Request as LocalRequest } from "../../../../../src/compat/request";

const localFetch = createFetch({
  async fetch(request) {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: request.signal,
      redirect: "manual",
      encodeResponseBody: "manual",
    } as RequestInit);
    return {
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers] as [string, string][],
      body: response.body,
    };
  },
});
export default {
  async fetch(_request: Request, env: { UPSTREAM: string }) {
    if (new URL(_request.url).pathname === "/node-http") {
      const name = new URL(_request.url).searchParams.get(
        "case",
      ) as keyof typeof nodeHttpNetworkContract.cases;
      const reports: Record<string, string> = {};
      for (const [kind, module] of Object.entries({
        reference: nodeHttp,
        candidate: localHttp,
      })) {
        try {
          await nodeHttpNetworkContract.cases[name]({
            request: module.request,
            get: module.get,
            baseURL: env.UPSTREAM,
          } as never);
          reports[kind] = "passed";
        } catch (error) {
          reports[kind] = String(error);
        }
      }
      return Response.json(reports);
    }
    const reference = {
      fetch: globalThis.fetch.bind(globalThis),
      Request,
      baseURL: env.UPSTREAM,
    } as unknown as ConstructorParameters<typeof FetchPolicyImplementation>[0];
    const candidate = {
      fetch: localFetch,
      Request: LocalRequest,
      baseURL: env.UPSTREAM,
    };
    const name = new URL(_request.url).searchParams.get(
      "case",
    ) as keyof typeof fetchPolicyContract.cases;
    if (name && fetchPolicyContract.cases[name]) {
      const reports: Record<string, string> = {};
      for (const [kind, api] of Object.entries({ reference, candidate })) {
        try {
          await fetchPolicyContract.cases[name](api);
          reports[kind] = "passed";
        } catch (error) {
          reports[kind] = String(error);
        }
      }
      return Response.json(reports);
    }
    return Response.json({
      reference: await runContract(
        new FetchPolicyImplementation(reference),
        fetchPolicyContract,
      ),
      candidate: await runContract(
        new FetchPolicyImplementation(candidate),
        fetchPolicyContract,
      ),
    });
  },
};
