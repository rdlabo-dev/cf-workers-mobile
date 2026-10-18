import { runContract } from "@rdlabo/capacitor-workers/testing";
import {
  localStructuredCloneApi,
  StructuredCloneImplementation,
  structuredCloneContract,
} from "../../../../../src/compat/structured-clone/index.spec";
import type { Headers as LocalHeaders } from "../../../../../src/compat/headers";
import type { Request as LocalRequest } from "../../../../../src/compat/request";
import type { Response as LocalResponse } from "../../../../../src/compat/response";

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
