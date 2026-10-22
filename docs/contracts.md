# Feature contract API

The unit of compatibility is a **named, typed profile**, not a base class for each API category. One profile connects its API type, declared behavior cases, implementations and tests. An implementation can be local, delegated or supplied by workerd without changing the contract runner.

The foundation has three parts:

| Part                             | Responsibility                                                              |
| -------------------------------- | --------------------------------------------------------------------------- |
| `Feature<ID, API, Case>`         | Immutable identity and case names; preserves the native API shape           |
| `FeatureImplementation<Feature>` | Required implementation API and explicit coverage of every case             |
| `openFeature` / `runContract`    | Setup rollback, scoped cleanup, fresh scope per case and structured results |

`FeatureImplementation` is an abstract class, but lifecycle state belongs to the host, not the subclass. Implementations implement `create(scope)`; they cannot override the host's initialization or cleanup functions. Classes and methods inside the returned API are unrestricted. There is no generic `execute(name, args)` protocol, global registry or separate runner for bindings and engine capabilities.

## Add a feature

```ts
import {
  defineFeature,
  FeatureImplementation,
  openFeature,
  type FeatureScope,
} from "cf-workers-native/shared/contracts";
import {
  runContract,
  assertContract,
  type ContractSuite,
} from "cf-workers-native/shared/contracts/testing";

interface TextAPI {
  read(key: string): Promise<string | null>;
}
const text = defineFeature<TextAPI>()("example.text", ["missing"]);

class MemoryText extends FeatureImplementation<typeof text> {
  constructor() {
    super(text, { missing: { status: "supported" } });
  }
  create(scope: FeatureScope): TextAPI {
    const values = new Map<string, string>();
    scope.defer(() => values.clear());
    return { read: async (key) => values.get(key) ?? null };
  }
}

const contract: ContractSuite<typeof text> = {
  feature: text,
  cases: {
    async missing(api) {
      if ((await api.read("absent")) !== null) throw new Error("Expected null");
    },
  },
};
assertContract(await runContract(new MemoryText(), contract));

// The same host can be used independently of tests.
const session = await openFeature(new MemoryText());
try {
  await session.api.read("key");
} finally {
  await session.dispose();
}
```

The implementation determines the API type; callers cannot choose an unrelated result type for `openFeature`. The suite must carry the same feature definition. Compile-time negative tests in `tests/types/features.ts` cover missing operations, wrong arguments/results, missing/invented cases and a different feature identity. The typecheck command checks these with `@ts-expect-error`; removing a necessary error fails the build. Runtime checks also reject mismatched feature objects and incomplete coverage. As with other TypeScript APIs, `any` or explicit unsafe casts can bypass static guarantees.

Use one exported definition per profile and import it everywhere. IDs must describe a stable scope; change the ID when changing its contract incompatibly. Profile case names represent behavioral guarantees, not necessarily method names. The profile must document what it does **not** establish. Passing a small subset never establishes compatibility with the entire Workers service.

## Lifetime and requirements

`create` may be synchronous or asynchronous. Register each owned resource immediately with `scope.defer`, including before awaiting setup that can fail. The host rolls back partial setup and disposes successful sessions in reverse registration order. It attempts every cleanup even if one fails, and repeated disposal shares the same promise. Feature shutdown aborts `scope.signal` before cleanup. Initialization errors and cleanup errors are preserved in an AggregateError when both occur.

A feature scope is not a request scope or a data lifetime. Do not register externally owned database connections for cleanup unless ownership has explicitly transferred. Persistent test providers must use their own isolated namespace and register its cleanup; a new scope alone cannot reset an external service. Implementations must return an independently prepared API for each `create` call.

Requirements are executable checks in `create`, not strings in an unverified capability registry. Throw `FeatureUnavailable` if a required environment facility is absent. The engine example checks `WebAssembly.validate`. This detects availability and validates a narrow behavior profile; it does not provide or emulate V8.

`openFeature` awaits initialization before exposing a session. It does not add pre-initialization cancellation, deadlines or arbitrary operation cancellation. Implementations are responsible for settling startup and their operations; test framework timeouts remain relevant. A feature's dispose does not generically revoke retained API objects. Request cancellation and streaming stay with the fetch transport.

## Result and CI rules

`runContract` prepares a fresh scope for every supported case, runs its assertion, and always cleans up. Results contain the feature ID, stable case IDs, status and reason, plus cleanup failures.

- `passed`: the declared expectation held.
- `failed`: setup/assertion failed; cleanup failures also fail the report.
- `unsupported`: explicitly outside this implementation's declared coverage, with a mandatory reason. The case is not executed and is never counted as passed.
- `unavailable`: a required environment capability was absent. A claimed-supported case in this state fails verification.

`assertContract` rejects failed/unavailable cases, cleanup failures and reports with no passing cases. A partial profile can contain explicit unsupported entries; CI requiring full coverage must additionally assert all statuses are `passed`, as the demo does. Changing coverage is a reviewable scope change, not a way to hide a failing case. Vitest and Playwright remain the test runners; the common layer has no test framework dependency.

## FetchRuntime

`FetchRuntime` is exported from `cf-workers-native/capacitor` for custom execution adapters.
Subclasses implement `dispatch(request, env, ctx)` and may override `ready` and
`close(): void | Promise<void>` for startup and owned-resource cleanup.
Construction does not patch global fetch; call the bound `fetch` method directly.
Keep `fetch`, `drain` and `dispose` inherited so URL boundaries, aborts, response
validation, HEAD normalization and cleanup share the same behavior.
`drain` tracks background work, not response body consumption. Direct disposal
cannot forcibly stop arbitrary handler code.

Use `workersCapacitor` for application setup. Reusable Fetch and KV contracts are
exported from `cloudflare/workers/testing` and `cloudflare/bindings/kv/testing`
under the package name. KV test providers must isolate and clean their own
namespace; creating a fresh scope does not clear persistent storage.
