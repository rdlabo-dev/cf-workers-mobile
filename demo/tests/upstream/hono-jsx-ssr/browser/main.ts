import { workersCapacitor } from "@rdlabo/workers-capacitor";

const prefer =
  new URL(location.href).searchParams.get("prefer") === "direct"
    ? "direct"
    : "worker";
const runtime = workersCapacitor({ baseURL: "https://worker.invalid", prefer });
declare global {
  interface Window {
    upstreamReady: Promise<typeof runtime.execution>;
  }
}
window.upstreamReady = runtime.ready.then(() => runtime.execution);
