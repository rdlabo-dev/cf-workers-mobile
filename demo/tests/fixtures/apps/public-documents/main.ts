import { workersCapacitor } from "workers-capacitor";
const app = workersCapacitor({
  baseURL: "https://worker.invalid",
  render: "/pages/home",
});
await app.ready;
