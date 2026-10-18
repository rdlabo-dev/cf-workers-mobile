import { capacitorWorkers } from "@rdlabo/capacitor-workers";
import { runNodeContracts } from "../node-modules";

async function run() {
  const runtime = capacitorWorkers({
    baseURL: "https://node-contract.invalid",
    worker: { fetch: () => new Response(null, { status: 204 }) },
  });
  try {
    postMessage(await runNodeContracts("bundled"));
  } finally {
    await runtime.dispose();
  }
}
void run();
