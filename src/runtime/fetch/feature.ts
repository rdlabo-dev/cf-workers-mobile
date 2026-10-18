import {
  defineFeature,
  FeatureImplementation,
  type FeatureScope,
} from "../../contracts/index.js";
import { createFetchRuntime } from "./worker-runtime.js";
import type { WorkersCapacitorOptions } from "./types.js";

/** A deliberately small portable HTTP profile, not the full fetch specification. */
export const fetchFeature = defineFeature<typeof fetch>()("fetch.basic", [
  "request",
  "response",
  "missing",
  "head",
]);

/** Connects the existing runtime to the common feature host without patching globals. */
export class FetchImplementation<Env> extends FeatureImplementation<
  typeof fetchFeature
> {
  constructor(private readonly options: WorkersCapacitorOptions<Env>) {
    super(fetchFeature, {
      request: { status: "supported" },
      response: { status: "supported" },
      missing: { status: "supported" },
      head: { status: "supported" },
    });
  }
  async create(scope: FeatureScope) {
    const runtime = createFetchRuntime(this.options);
    scope.defer(() => runtime.dispose());
    await runtime.ready;
    return runtime.fetch;
  }
}
