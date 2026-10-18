import {
  FeatureUnavailable,
  openFeature,
  type FeatureAPI,
  type FeatureImplementation,
} from "./index.js";
interface Definition {
  readonly id: string;
  readonly cases: readonly string[];
}
export interface ContractSuite<F extends Definition> {
  readonly feature: F;
  readonly cases: Readonly<
    Record<F["cases"][number], (api: FeatureAPI<F>) => void | Promise<void>>
  >;
}
export interface ContractResult {
  feature: string;
  cases: {
    id: string;
    status: "passed" | "failed" | "unsupported" | "unavailable";
    reason?: string;
  }[];
  errors: string[];
}
function message(error: unknown) {
  try {
    return String(error);
  } catch {
    return "Unprintable failure";
  }
}
export async function runContract<F extends Definition>(
  implementation: FeatureImplementation<F>,
  suite: ContractSuite<NoInfer<F>>,
): Promise<ContractResult> {
  if (
    implementation.feature !== suite.feature ||
    Object.keys(suite.cases).length !== suite.feature.cases.length ||
    suite.feature.cases.some((id) => !Object.hasOwn(suite.cases, id))
  )
    throw new TypeError(
      "Contract suite must match the implementation's feature and cases",
    );
  const results: ContractResult = {
    feature: suite.feature.id,
    cases: [],
    errors: [],
  };
  // Each case gets a fresh scope; implementations must isolate external state.
  for (const id of suite.feature.cases as readonly F["cases"][number][]) {
    const support = implementation.coverage[id];
    if (support.status === "unsupported") {
      results.cases.push({ id, status: "unsupported", reason: support.reason });
      continue;
    }
    let session: Awaited<ReturnType<typeof openFeature<F>>> | undefined;
    try {
      session = await openFeature(implementation);
      await suite.cases[id](session.api);
      results.cases.push({ id, status: "passed" });
    } catch (error) {
      results.cases.push({
        id,
        status: error instanceof FeatureUnavailable ? "unavailable" : "failed",
        reason: message(error),
      });
    } finally {
      try {
        await session?.dispose();
      } catch (error) {
        results.errors.push(`${id}: ${message(error)}`);
      }
    }
  }
  return results;
}
/** Supported cases must pass. Unsupported cases remain visible in the report. */
export function assertContract(result: ContractResult) {
  if (
    !result.cases.some((test) => test.status === "passed") ||
    result.errors.length ||
    result.cases.some(
      (test) => test.status === "failed" || test.status === "unavailable",
    )
  )
    throw new Error(JSON.stringify(result));
}
