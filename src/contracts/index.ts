declare const apiType: unique symbol;

/** A typed identity, independent of transport and implementation. */
export class Feature<ID extends string, API, Case extends string> {
  declare readonly [apiType]: (api: API) => API;
  constructor(
    readonly id: ID,
    readonly cases: readonly Case[],
  ) {
    if (!id || !cases.length || new Set(cases).size !== cases.length)
      throw new TypeError("A feature needs an id and unique contract cases");
    this.cases = Object.freeze([...cases]);
    Object.freeze(this);
  }
}
export function defineFeature<API>() {
  return <const ID extends string, const Cases extends readonly string[]>(
    id: ID,
    cases: Cases,
  ) => new Feature<ID, API, Cases[number]>(id, cases);
}
interface Definition {
  readonly id: string;
  readonly cases: readonly string[];
}
export type FeatureAPI<F> =
  F extends Feature<string, infer API, string> ? API : never;
export type Support =
  | { readonly status: "supported" }
  | { readonly status: "unsupported"; readonly reason: string };
export type Coverage<F extends Definition> = Readonly<
  Record<F["cases"][number], Support>
>;
export interface FeatureScope {
  /** Feature lifetime, not a request signal. */
  readonly signal: AbortSignal;
  /** Register owned resources immediately, including during partial setup. */
  defer(cleanup: () => void | Promise<void>): void;
}

export abstract class FeatureImplementation<F extends Definition> {
  readonly coverage: Coverage<F>;
  constructor(
    readonly feature: F,
    coverage: Coverage<F>,
  ) {
    if (
      Object.keys(coverage).length !== feature.cases.length ||
      feature.cases.some((id) => !Object.hasOwn(coverage, id))
    )
      throw new TypeError(
        "Coverage must declare every contract case exactly once",
      );
    for (const support of Object.values(coverage) as Support[]) {
      if (
        !support ||
        !["supported", "unsupported"].includes(support.status) ||
        (support.status === "unsupported" && !support.reason?.trim())
      )
        throw new TypeError("Unsupported cases need a reason");
    }
    this.coverage = Object.freeze(
      Object.fromEntries(
        Object.entries(coverage).map(([id, value]) => [
          id,
          Object.freeze({ ...(value as Support) }),
        ]),
      ),
    ) as Coverage<F>;
  }
  abstract create(scope: FeatureScope): FeatureAPI<F> | Promise<FeatureAPI<F>>;
}

/** Required environment capability is missing; never counted as a passing test. */
export class FeatureUnavailable extends Error {}

/** Owns setup rollback and idempotent, reverse-order asynchronous cleanup. */
export async function openFeature<F extends Definition>(
  implementation: FeatureImplementation<F>,
) {
  const controller = new AbortController();
  const cleanups: (() => void | Promise<void>)[] = [];
  let closing: Promise<void> | undefined;
  let closed = false;
  const dispose = () => {
    if (closing) return closing;
    closed = true;
    // Establish closing before abort listeners or cleanup can reenter disposal.
    closing = Promise.resolve().then(async () => {
      const errors: unknown[] = [];
      for (const cleanup of cleanups.reverse()) {
        try {
          await cleanup();
        } catch (error) {
          errors.push(error);
        }
      }
      cleanups.length = 0;
      if (errors.length)
        throw new AggregateError(errors, "Feature cleanup failed");
    });
    controller.abort();
    return closing;
  };
  try {
    const api = await implementation.create({
      signal: controller.signal,
      defer(cleanup) {
        if (closed) throw new Error("Feature scope is closed");
        cleanups.push(cleanup);
      },
    });
    return { api, dispose };
  } catch (error) {
    try {
      await dispose();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Feature setup and cleanup failed",
      );
    }
    throw error;
  }
}
