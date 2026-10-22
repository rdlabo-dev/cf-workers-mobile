import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { completionReport } from "./completion-report.mjs";
const baseline = JSON.parse(
  await readFile(new URL("exports.json", import.meta.url), "utf8"),
);
function reports() {
  return Object.fromEntries(
    ["chromium", "webkit"].map((engine) => [
      engine,
      {
        profile: structuredClone(baseline.profile),
        modules: Object.fromEntries(
          Object.keys(baseline.modules).map((name) => [
            name,
            { surface: {}, missing: [], extra: [], typeMismatches: {} },
          ]),
        ),
      },
    ]),
  );
}
test("even exact export alignment cannot certify behavioral/native compatibility", () => {
  const result = completionReport(baseline, reports());
  assert.equal(
    result.summary.surfaceAligned,
    Object.keys(baseline.modules).length,
  );
  assert.equal(result.summary.certifiedCompleteByThisAudit, 0);
  assert.ok(
    Object.values(result.modules).every(
      (module) =>
        module.status === "surface-aligned-not-certified" &&
        module.next &&
        module.evidence.length,
    ),
  );
  assert.equal(result.modules["fs"].category, "implementation-gap");
  assert.equal(result.modules["stream/web"].category, "behavior-gap");
  assert.equal(result.modules["util/types"].category, "engine-boundary");
});
test("one engine's missing export, import error or wrong type remains debt", () => {
  for (const change of [
    { missing: ["once"] },
    { buildError: ["unresolved"] },
    { evaluationError: { name: "TypeError", message: "broken" } },
    { typeMismatches: { once: { expected: "function", actual: "object" } } },
  ]) {
    const input = reports();
    Object.assign(input.webkit.modules.events, change);
    const result = completionReport(baseline, input);
    assert.equal(result.summary.withSurfaceGaps, 1);
    assert.equal(result.modules.events.status, "surface-gaps");
  }
});
test("missing engines, modules and stale profiles fail rather than disappear", () => {
  let input = reports();
  delete input.webkit;
  assert.throws(() => completionReport(baseline, input));
  input = reports();
  delete input.webkit.modules.crypto;
  assert.throws(
    () => completionReport(baseline, input),
    /incomplete inventory/,
  );
  input = reports();
  input.chromium.profile.workerd = "different";
  assert.throws(
    () => completionReport(baseline, input),
    /mismatched Workers profile/,
  );
});
test("old reports without the type audit cannot be promoted as current evidence", () => {
  const input = reports();
  delete input.chromium.modules.events.typeMismatches;
  assert.throws(() => completionReport(baseline, input), /missing type audit/);
});
