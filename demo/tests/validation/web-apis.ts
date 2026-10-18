import type { ContractResult } from "@rdlabo/capacitor-workers/testing";
import { runWebApiContracts } from "./web-api-contracts";

export async function runWebApis() {
  const direct = await runWebApiContracts();
  const worker = new Worker(new URL("./entries/web-apis.ts", import.meta.url), {
    type: "module",
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const isolated = await new Promise<ContractResult[]>((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("Web API contract Worker timed out")),
        10000,
      );
      worker.onmessage = (event) => resolve(event.data);
      worker.onerror = (event) => reject(new Error(event.message));
      worker.onmessageerror = () =>
        reject(new Error("Web API contract result could not be decoded"));
    });
    return [
      ...direct.map((report) => ({ environment: "direct", ...report })),
      ...isolated.map((report) => ({ environment: "isolated", ...report })),
    ];
  } finally {
    clearTimeout(timer);
    worker.terminate();
  }
}
