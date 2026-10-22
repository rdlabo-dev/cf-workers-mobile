import assert from "node:assert/strict";
import test from "node:test";
import { waitForReleaseCI } from "./release-wait.mjs";

function fixture(sequence, comparison = "identical") {
  let calls = 0;
  let sleeps = 0;
  const github = {
    rest: {
      repos: {
        getCommit: async () => ({ data: { sha: "tagged" } }),
        getBranch: async () => ({ data: { commit: { sha: "main" } } }),
        compareCommits: async () => ({ data: { status: comparison } }),
      },
      actions: { listWorkflowRuns: "runs" },
    },
    paginate: async (_, params) => {
      assert.equal(params.head_sha, "tagged");
      assert.equal(params.event, "push");
      assert.equal(params.branch, "main");
      assert.equal(params.workflow_id, "ci.yml");
      return sequence[Math.min(calls++, sequence.length - 1)];
    },
  };
  const context = {
    repo: { owner: "owner", repo: "repo" },
    eventName: "push",
    ref: "refs/tags/v0.1.3",
  };
  return {
    run: () =>
      waitForReleaseCI(github, context, {
        attempts: 3,
        sleep: async () => {
          sleeps++;
        },
      }),
    counts: () => ({ calls, sleeps }),
  };
}
const success = { run_number: 1, status: "completed", conclusion: "success" };

test("tag push waits for missing and in-progress main CI", async () => {
  const f = fixture([
    [],
    [{ run_number: 1, status: "in_progress" }],
    [success],
  ]);
  await f.run();
  assert.deepEqual(f.counts(), { calls: 3, sleeps: 2 });
});
test("already successful CI needs no wait", async () => {
  const f = fixture([[success]]);
  await f.run();
  assert.deepEqual(f.counts(), { calls: 1, sleeps: 0 });
});
test("newest run takes precedence over an older success", async () => {
  const f = fixture([
    [success, { run_number: 2, status: "queued" }],
    [{ ...success, run_number: 2 }],
  ]);
  await f.run();
  assert.deepEqual(f.counts(), { calls: 2, sleeps: 1 });
});
test("failed or cancelled main CI refuses publication", async () => {
  for (const conclusion of ["failure", "cancelled", "timed_out", "skipped"]) {
    const f = fixture([
      [success, { run_number: 2, status: "completed", conclusion }],
    ]);
    await assert.rejects(f.run(), /Main Compatibility failed/);
    assert.equal(f.counts().sleeps, 0);
  }
});
test("missing CI has a bounded wait", async () => {
  const f = fixture([[]]);
  await assert.rejects(f.run(), /Timed out/);
  assert.deepEqual(f.counts(), { calls: 3, sleeps: 2 });
});
test("tags outside main fail before waiting", async () => {
  const f = fixture([[success]], "diverged");
  await assert.rejects(f.run(), /commit on main/);
  assert.deepEqual(f.counts(), { calls: 0, sleeps: 0 });
});
