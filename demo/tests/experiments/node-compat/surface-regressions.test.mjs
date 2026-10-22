import { test } from "node:test";
import assert from "node:assert/strict";
import { assertNoSurfaceRegression as check } from "./surface-regressions.mjs";

test("known incomplete modules cannot lose more exports or stop importing", () => {
  const debt = { missing: ["pending"], extra: ["legacy"] };
  check("util", { missing: [], extra: [] }, debt);
  check("util", debt, debt);
  assert.throws(() => check("util", { missing: ["pending", "inspect"] }, debt));
  assert.throws(() => check("util", { extra: ["unexpected"] }, debt));
  assert.throws(() => check("util", { buildError: ["unresolved"] }, debt));
  assert.throws(() =>
    check("util", { evaluationError: { name: "TypeError" } }, debt),
  );
  assert.throws(() => check("new-module", { missing: ["fetch"] }));
});

test("import failure debt permits recovery but not a different failure", () => {
  const debt = { buildError: ["unresolved"] };
  check("module", debt, debt);
  check("module", { missing: ["pending"], extra: [] }, debt);
  assert.throws(() => check("module", { buildError: ["syntax error"] }, debt));
  assert.throws(() =>
    check("module", { evaluationError: { name: "TypeError" } }, debt),
  );
});

test("an export retaining its name but losing callability is a regression", () => {
  const broken = {
    missing: [],
    extra: [],
    typeMismatches: { once: { expected: "function", actual: "object" } },
  };
  assert.throws(() => check("events", broken), /changed export types/);
  assert.throws(
    () => check("events", broken, { buildError: ["unresolved"] }),
    /changed export types/,
  );
  check("events", { missing: [], extra: [], typeMismatches: {} });
});
