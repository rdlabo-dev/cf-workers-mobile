import { workersCapacitor } from "workers-capacitor";
const runtime = workersCapacitor({
  baseURL: "https://worker.invalid/",
  remote: {
    origin: import.meta.env.VITE_WORKER_ORIGIN || "https://unreachable.invalid",
    ...(import.meta.env.VITE_TEST_DEVICE_TOKEN
      ? { getToken: () => import.meta.env.VITE_TEST_DEVICE_TOKEN }
      : {}),
  },
  ...(import.meta.env.VITE_WORKER_ORIGIN ? { render: "/" } : {}),
});
Object.assign(window, { runtime });
await runtime.ready;
