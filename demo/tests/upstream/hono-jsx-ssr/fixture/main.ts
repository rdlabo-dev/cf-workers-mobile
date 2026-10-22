import { workersCapacitor } from "cf-workers-native/capacitor";

const app = workersCapacitor({
  baseURL: "https://worker.invalid",
  render: "/",
});
await app.ready;
console.log("UPSTREAM_READY", app.execution);
