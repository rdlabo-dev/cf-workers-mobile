import type {
  WorkerExecution,
  WorkersCapacitorPluginOptions,
} from "../../src/tooling/vite.js";
import type { WorkerExecution as EsbuildExecution } from "../../src/tooling/esbuild.js";

const modes: WorkerExecution[] = ["network", "local"];
const routes = [
  { method: "*", path: "/app/*" },
  { method: "GET", path: /^\/pages\// },
] as const satisfies WorkerExecution;
const sameContract: EsbuildExecution = routes;
const defaultOptions: WorkersCapacitorPluginOptions = { worker: "worker.ts" };
// @ts-expect-error There is no automatic publication permission.
const auto: WorkerExecution = "auto";
// @ts-expect-error Route selection is an array, not a separate mode.
const manual: WorkerExecution = "manual";
// @ts-expect-error Booleans do not silently enable whole-Worker distribution.
const enabled: WorkerExecution = true;
// @ts-expect-error HTTP methods must be uppercase or '*'.
const invalidMethod: WorkerExecution = [{ method: "get", path: "/" }];
const oldOptions: WorkersCapacitorPluginOptions = {
  worker: "worker.ts",
  // @ts-expect-error The old second configuration field is not accepted.
  localRoutes: [],
};
void [
  modes,
  routes,
  sameContract,
  defaultOptions,
  auto,
  manual,
  enabled,
  invalidMethod,
  oldOptions,
];
