import { initializeWorkerNetwork } from "../../../../dist/compat/fetch/relay";
import {
  getNativeCall,
  nativeNetwork,
} from "../../../../dist/compat/fetch/native-network";
import { FetchTransport } from "../../../../dist/compat/fetch/transport";
import { runNativeNetwork } from "../../validation/native-network";

await initializeWorkerNetwork();
const params = new URL(import.meta.url).searchParams;
const base = params.get("base")!;
if (params.has("pending")) {
  const transport = new FetchTransport(nativeNetwork);
  void transport
    .fetch({
      url: `${base}/never?id=${params.get("pending")}`,
      method: "GET",
      headers: [],
      body: null,
      signal: new AbortController().signal,
    })
    .catch(() => {});
} else {
  self.postMessage({
    type: "network-report",
    results: await runNativeNetwork(base, getNativeCall()),
  });
}
