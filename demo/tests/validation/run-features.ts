import { verifyKVPersistence } from "./kv";
import { FetchImplementation } from "@rdlabo/capacitor-workers/features/fetch";
import { assertContract, runContract } from "@rdlabo/capacitor-workers/testing";
import worker from "../fixtures/workers/compatibility/fetch";
const isolated = () =>
  new Worker(new URL("./entries/fetch.ts", import.meta.url), {
    type: "module",
  });
import { fetchContract } from "@rdlabo/capacitor-workers/testing/fetch";
import { kvContract } from "@rdlabo/capacitor-workers/testing/kv";
import { wasmContract } from "./contracts/wasm";
import { runNodeContracts } from "./node-modules";
import { runNodeContractsInWorker } from "./node-worker";
import { PersistentText, WasmValidation } from "./implementations";
export async function runFeatures() {
  await verifyKVPersistence();
  const reports = [];
  for (const [name, entry] of [
    ["direct", worker],
    ["isolated", isolated],
  ] as const) {
    const report = await runContract(
      new FetchImplementation({
        worker: entry,
        baseURL: "https://worker.invalid/api",
      }),
      fetchContract,
    );
    reports.push({ environment: name, ...report });
  }
  reports.push({
    environment: "webview",
    ...(await runContract(new PersistentText(), kvContract)),
  });
  reports.push({
    environment: "webview",
    ...(await runContract(new WasmValidation(), wasmContract)),
  });
  for (const report of await runNodeContracts("bundled"))
    reports.push({ environment: "direct", ...report });
  for (const report of await runNodeContractsInWorker())
    reports.push({ environment: "isolated", ...report });
  for (const report of reports) assertContract(report);
  return reports;
}
