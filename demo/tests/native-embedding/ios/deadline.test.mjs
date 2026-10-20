import { test } from "node:test";
import assert from "node:assert/strict";
import { createProbeDeadline } from "./deadline.mjs";

function setup(t, scenario = "normal") {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const failures = [];
  const stages = [];
  const deadline = createProbeDeadline({
    scenario,
    onTimeout: (message) => failures.push(message),
    onStage: (message) => stages.push(message),
  });
  return { deadline, failures, stages };
}

test("a simulator that never starts fails within the launch budget", (t) => {
  const { failures } = setup(t);
  t.mock.timers.tick(89999);
  assert.deepEqual(failures, []);
  t.mock.timers.tick(1);
  assert.match(failures[0], /launch timed out after 90000ms/);
});

for (const scenario of ["normal", "startup-failure", "broken-entry"]) {
  test(`${scenario}: slow launch leaves the full scenario budget, duplicate markers cannot extend it`, (t) => {
    const { deadline, failures, stages } = setup(t, scenario);
    t.mock.timers.tick(56000);
    deadline.sceneStarted();
    const budget = scenario === "normal" ? 120000 : 90000;
    t.mock.timers.tick(budget - 1);
    assert.deepEqual(failures, []);
    deadline.sceneStarted();
    t.mock.timers.tick(1);
    assert.equal(stages.length, 1);
    assert.match(stages[0], /launchElapsedMs=56000/);
    assert.equal(failures.length, 1);
    assert.match(
      failures[0],
      new RegExp(`scenario timed out after ${budget}ms`),
    );
  });
}

for (const stage of ["launch", "scenario"]) {
  test(`completion or process failure during ${stage} cancels all deadlines`, (t) => {
    const { deadline, failures } = setup(t);
    if (stage === "scenario") deadline.sceneStarted();
    deadline.stop();
    deadline.sceneStarted();
    t.mock.timers.tick(300000);
    assert.deepEqual(failures, []);
  });
}
