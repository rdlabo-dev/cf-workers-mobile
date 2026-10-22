import { workersCapacitor } from "cf-workers-native/capacitor";
const app = workersCapacitor({
  baseURL: "https://worker.invalid",
  render: "/pages/home",
});
await app.ready;
