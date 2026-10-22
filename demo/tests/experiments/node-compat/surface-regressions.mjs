import assert from "node:assert/strict";

// Debt is bounded by the exact missing/extra exports and failure stage, not
// by module name. Improvements are allowed; new breakage must fail CI.
export function assertNoSurfaceRegression(name, actual, known = {}) {
  for (const stage of ["buildError", "evaluationError"]) {
    if (actual[stage])
      assert.deepEqual(actual[stage], known[stage], `${name}: new ${stage}`);
  }
  assert.deepEqual(
    actual.typeMismatches ?? {},
    known.typeMismatches ?? {},
    `${name}: changed export types`,
  );
  // Previously unimportable modules may become importable incrementally.
  if (known.buildError || known.evaluationError) return;
  for (const kind of ["missing", "extra"]) {
    const additions = (actual[kind] ?? []).filter(
      (value) => !(known[kind] ?? []).includes(value),
    );
    assert.deepEqual(additions, [], `${name}: new ${kind} exports`);
  }
}
