import { workersCapacitor } from "cf-workers-mobile/capacitor";
const origin = import.meta.env.VITE_WORKER_ORIGIN;
if (!origin)
  throw new Error(
    "Set VITE_WORKER_ORIGIN to your deployed Worker HTTPS origin",
  );
const runtime = workersCapacitor({
  baseURL: "https://worker.invalid/",
  remote: { origin },
  render: "/",
});
await runtime.ready;
