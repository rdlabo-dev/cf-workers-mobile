import { workersCapacitor } from "@rdlabo/workers-capacitor";
// The configured Worker supplies the complete HTML document and owns routing.
const app = workersCapacitor({
  baseURL: "https://worker.invalid",
  render: "/",
});
await app.ready;
