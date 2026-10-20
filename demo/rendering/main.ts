import { workersCapacitor } from "cf-workers-mobile/capacitor";
// The configured Worker supplies the complete HTML document and owns routing.
const app = workersCapacitor({
  baseURL: "https://worker.invalid",
  render: "/",
});
await app.ready;
