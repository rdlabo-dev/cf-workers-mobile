import { workersCapacitor } from "workers-capacitor";
const runtime = workersCapacitor({
  baseURL: "https://worker.invalid/",
  ...(import.meta.env.VITE_REPORT_ORIGIN ? { render: "/" } : {}),
});
Object.assign(window, { runtime });
await runtime.ready;
