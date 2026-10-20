import { workersCapacitor } from "cf-workers-mobile/capacitor";
const app = workersCapacitor({
  baseURL: "https://worker.invalid",
  render: "/pages/home",
});
await app.ready;
