import { workersCapacitor } from "cf-workers-native/capacitor";
await workersCapacitor({
  baseURL: "https://worker.invalid/",
  remote: {
    origin: import.meta.env.VITE_WORKER_ORIGIN,
    getToken: () => import.meta.env.VITE_TEST_DEVICE_TOKEN,
  },
  render: "/",
}).ready;
