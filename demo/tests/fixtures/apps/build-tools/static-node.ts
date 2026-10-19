import { workersCapacitor } from "workers-capacitor";
import worker from "./static-node-worker";

async function run() {
  const runtime = workersCapacitor({
    baseURL: "https://node.invalid/",
    worker,
  });
  try {
    await runtime.ready;
    return await (await fetch("/")).json();
  } finally {
    runtime.dispose();
  }
}
declare global {
  interface Window {
    runStaticNodeBuild: typeof run;
  }
}
window.runStaticNodeBuild = run;
