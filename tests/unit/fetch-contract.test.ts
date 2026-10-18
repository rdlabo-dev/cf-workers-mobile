import {
  workersCapacitor,
  FetchRuntime,
  type WorkerContext,
} from "../../src/index";
import {
  defineFetchContract,
  type FetchContractOptions,
} from "../contracts/fetch";
import { workerFor } from "../helpers/isolated-worker";

defineFetchContract("direct FetchRuntime", (options) => {
  const runtime = workersCapacitor(options);
  return { ...runtime, fetch: globalThis.fetch };
});
defineFetchContract("isolated FetchRuntime", (options) => {
  const runtime = workersCapacitor({
    ...options,
    worker: () => workerFor(options.worker) as unknown as Worker,
  });
  return { ...runtime, fetch: globalThis.fetch };
});

// Contributor recipe: only execution varies; the inherited Fetch contract is unchanged.
class CustomRuntime extends FetchRuntime<Record<string, unknown>> {
  constructor(private readonly config: FetchContractOptions) {
    super(config);
  }
  protected dispatch(
    request: Request,
    env: Record<string, unknown>,
    ctx: WorkerContext,
  ) {
    return this.config.worker.fetch(request, env, ctx);
  }
}
defineFetchContract(
  "custom subclass without global installation",
  (options) => new CustomRuntime(options),
);
