import { workersCapacitor } from "cf-workers-native/capacitor";

// The Worker entry is configured in vite.config.ts.
const runtime = workersCapacitor({
  baseURL: "https://worker.invalid/",
});
await runtime.ready;

// Render the HTML returned by the Worker's root route.
const response = await fetch("/");
if (!response.ok) throw new Error(`Worker returned ${response.status}`);
document.querySelector("#page")!.innerHTML = await response.text();
