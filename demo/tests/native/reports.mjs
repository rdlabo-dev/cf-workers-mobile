import assert from "node:assert/strict";

export async function waitForAcceptance(backend, timeout) {
  const deadline = Date.now() + timeout;
  for (;;) {
    await backend.refresh?.();
    assert.equal(
      backend.reports.find((report) => report.stage === "failure"),
      undefined,
      JSON.stringify(backend.reports),
    );
    const complete = backend.reports.find(
      (report) => report.stage === "complete",
    );
    if (complete) return complete;
    assert.ok(
      Date.now() < deadline,
      JSON.stringify({
        reports: backend.reports,
        requests: backend.requests?.slice(-15),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
