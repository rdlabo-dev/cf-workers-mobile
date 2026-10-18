# Common feature standard

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
} from "@rdlabo/workers-capacitor/contracts";
import {
  runContract,
  assertContract,
  type ContractSuite,
} from "@rdlabo/workers-capacitor/contracts/testing";

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

## Three implementations of the same standard

| Profile                  | Local implementation                                                | Reference / verification                                                                                                    |
| ------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `fetch.basic`            | `FetchImplementation` connects existing direct or isolated runtimes | Same four HTTP cases run against an actual local workerd HTTP endpoint                                                      |
| `kv.local.v1`            | `LocalStorageKV` persistent binding                                 | Same eighteen text/binary/stream/metadata/bulk/list/expiration/Unicode cases run against an actual local Workers KV binding |
| `engine.wasm-validation` | Current engine's `WebAssembly.validate`                             | Same two valid/invalid-module cases run in workerd and WebViews                                                             |

Fetch connects through `@rdlabo/workers-capacitor/cloudflare/workers`; both the feature adapter and existing `workersCapacitor` installer use `createFetchRuntime`. The installer remains synchronous and application setup is unchanged. The existing fifteen fetch adapter cases and framework/transport tests remain as more detailed regression suites; the four portable HTTP cases do not replace them or claim that all URL/interception behavior exists in workerd.

Reusable HTTP and KV assertions are exported from `@rdlabo/workers-capacitor/cloudflare/workers/testing` and `@rdlabo/workers-capacitor/cloudflare/bindings/kv/testing`. The HTTP subpath also exports `fetchContractWorker`, the neutral Worker fixture; mount it at `https://worker.invalid/api` when running `fetchContract`. The engine demonstration remains in `demo/tests/validation/contracts/wasm.ts`. Environment-specific implementations live in `demo/tests/validation/implementations.ts`. The common runner itself never imports fetch, KV or WebAssembly. The workerd HTTP adapter converts the harness's Response type to a standard Response for this buffered HTTP profile; it makes no claim about streaming equivalence.

Workers KV uses the official [local binding facility](https://developers.cloudflare.com/kv/concepts/kv-bindings/), with an exclusively owned ephemeral namespace cleared before and after each case. The shipped local adapter uses Web Storage; its test wrapper deletes only test-owned keys. See [KV scope and usage](kv.md). Expiration, metadata and listing are included; cloud consistency and synchronization are not emulated. The earlier delegated-binding branch is not merged by this change. Its transport can later supply an API through this same standard without adding a new test architecture.

Completion for a new contribution: define the typed profile and scope, implement and declare coverage, add shared expectations, connect its real Workers reference, run type/unit/browser/native checks, and record actual supported environments and omissions. Do not edit the common runner to add another API category.

## Implementation guardrails and reusable contracts

Runtime checks belong to implementations. Validate inputs, reject unsupported options, detect missing facilities and propagate backend failures there, so application callers receive the same protections without importing testing code. The host remains responsible only for lifecycle and result handling; it contains no API-specific validation.

Published contract suites check the portable behavior promised by a profile. Implementations and their real Workers references run the same suite. Implementation rejection tests (for example unknown option fields) remain separate from shared compatibility assertions. Do not impose an implementation-specific rejection on a Workers reference that accepts the operation. Backend persistence, quota and namespace isolation are also verified separately.

```ts
import { runContract, assertContract } from "@rdlabo/workers-capacitor/contracts/testing";
import { kvContract } from "@rdlabo/workers-capacitor/cloudflare/bindings/kv/testing";

// implementation is your FeatureImplementation<typeof kvFeature>.
// Its create(scope) must prepare isolated test state and register its cleanup.
const report = await runContract(implementation, kvContract);
assertContract(report);
```

The KV suite writes several keys and assumes the test namespace is empty at the start of each case. Supply a test-only namespace and delete owned test data in the provider's cleanup. Never point it at application data. `runContract` creates a new feature scope per case, but does not clear externally owned storage. `assertContract` permits explicitly unsupported cases; require every case status to be `passed` when validating the entire profile. No test framework dependency or generic persistence fixture abstraction is introduced.
