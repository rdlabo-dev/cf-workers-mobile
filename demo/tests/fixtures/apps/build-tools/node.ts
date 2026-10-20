import {
  workersCapacitor,
  type ExecutionPreference,
} from "cf-workers-mobile/capacitor";

// The configured worker is tests/fixtures/workers/compatibility/node-contracts.ts
// for this build; direct executes it in-page, worker executes it as a
// Dedicated Worker bundled by the same plugin.
async function run(prefer: ExecutionPreference) {
  const runtime = workersCapacitor({
    baseURL: "https://node.invalid/",
    prefer,
  });
  let result;
  try {
    await runtime.ready;
    const payload = await (await fetch("/")).json();
    result = {
      execution: runtime.execution,
      contracts: payload.contracts,
      commonJsAssertions: payload.commonJsAssertions,
      commonJsStreams: payload.commonJsStreams,
      mixedModule: payload.mixedModule,
      globals: payload.globals,
      webGlobals: payload.webGlobals,
    };
  } finally {
    runtime.dispose();
  }
  return {
    ...result,
    cleanup: !(["Buffer", "process", "global"] as const).some((name) =>
      Object.hasOwn(globalThis, name),
    ),
  };
}
declare global {
  interface Window {
    runNodeBuild: typeof run;
  }
}
window.runNodeBuild = run;
