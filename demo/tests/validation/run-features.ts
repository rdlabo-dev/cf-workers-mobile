import { verifyKVPersistence } from "./kv";
import { FetchImplementation } from "cf-workers-native/cloudflare/workers";
import {
  assertContract,
  runContract,
} from "cf-workers-native/shared/contracts/testing";
import worker from "../fixtures/workers/compatibility/fetch";
const isolated = () =>
  new Worker(new URL("./entries/fetch.ts", import.meta.url), {
    type: "module",
  });
import { fetchContract } from "cf-workers-native/cloudflare/workers/testing";
import { kvContract } from "cf-workers-native/cloudflare/bindings/kv/testing";
import { wasmContract } from "./contracts/wasm";
import { runLocalNodeContracts } from "./node-modules";
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
  for (const report of await runLocalNodeContracts())
    reports.push({ environment: "direct", ...report });
  for (const report of await runNodeContractsInWorker())
    reports.push({ environment: "isolated", ...report });
  for (const report of reports) assertContract(report);
  return reports;
}
