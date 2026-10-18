import { runContract } from "@rdlabo/workers-capacitor/testing";
import {
  localStructuredCloneApi,
  StructuredCloneImplementation,
  structuredCloneContract,
} from "../../../../../src/compat/web/structured-clone/index.spec";
import type { Headers as LocalHeaders } from "../../../../../src/compat/web/headers";
import type { Request as LocalRequest } from "../../../../../src/compat/web/request";
import type { Response as LocalResponse } from "../../../../../src/compat/web/response";

const workersStructuredClone = (...args: unknown[]) =>
  Reflect.apply(globalThis.structuredClone, globalThis, args);
Object.defineProperties(workersStructuredClone, {
  name: { value: "structuredClone" },
  length: { value: 0 },
});

export default {
  async fetch() {
    return Response.json({
      workers: await runContract(
        new StructuredCloneImplementation({
          structuredClone: workersStructuredClone as typeof structuredClone,
          Headers: Headers as unknown as typeof LocalHeaders,
          Request: Request as unknown as typeof LocalRequest,
          Response: Response as unknown as typeof LocalResponse,
        }),
        structuredCloneContract,
      ),
      candidate: await runContract(
        new StructuredCloneImplementation(localStructuredCloneApi),
        structuredCloneContract,
      ),
    });
  },
};
