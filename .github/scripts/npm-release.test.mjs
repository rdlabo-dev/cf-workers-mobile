import assert from "node:assert/strict";
import test from "node:test";
import { releaseVersion, resolveRelease } from "./npm-release.mjs";

const sha = "a".repeat(40);
function fixture() {
  const state = {
    main: sha,
    comparison: "identical",
    pulls: [
      {
        number: 43,
        merged_at: "2026-10-19",
        base: { ref: "main" },
        merge_commit_sha: sha,
      },
    ],
    runs: [{ run_number: 2, status: "completed", conclusion: "success" }],
    pkg: { name: "workers-capacitor", version: "0.1.1" },
  };
  const context = {
    repo: { owner: "rdlabo-dev", repo: "workers-capacitor" },
    eventName: "workflow_run",
    payload: {
      workflow_run: {
        event: "push",
        head_branch: "main",
        head_sha: sha,
        head_repository: { full_name: "rdlabo-dev/workers-capacitor" },
        path: ".github/workflows/ci.yml",
        conclusion: "success",
      },
    },
  };
  const github = {
    rest: {
      repos: {
        getBranch: async () => ({ data: { commit: { sha: state.main } } }),
        getCommit: async () => ({ data: { sha } }),
        compareCommits: async () => ({ data: { status: state.comparison } }),
        getContent: async () => ({
          data: {
            content: Buffer.from(JSON.stringify(state.pkg)).toString("base64"),
          },
        }),
        listPullRequestsAssociatedWithCommit: "pulls",
      },
      actions: { listWorkflowRuns: "runs" },
    },
    paginate: async (method, params) => {
      assert.equal(params[method === "runs" ? "head_sha" : "commit_sha"], sha);
      return state[method];
    },
  };
  return { state, context, github };
}

test("stable and revision tags never select the beta channel", () => {
  assert.deepEqual(releaseVersion("0.1.1", "v0.1.1"), {
    version: "0.1.1",
    channel: "latest",
  });
  assert.deepEqual(releaseVersion("0.2.0-rc.1", "v0.2.0-rc.1"), {
    version: "0.2.0-rc.1",
    channel: "next",
  });
  for (const version of ["01.1.0", "1.0.0-01", "1.0.0-", "1.0.0;echo"]) {
    assert.throws(() => releaseVersion(version, `v${version}`));
  }
  assert.throws(() => releaseVersion("0.1.1", "v0.1.2"));
});

test("a successful exact merge commit creates an immutable beta", async () => {
  const { github, context } = fixture();
  assert.deepEqual(await resolveRelease(github, context), {
    sha,
    version: "0.1.1-beta.pr43.shaaaaaaaaaaaaa",
    channel: "beta",
  });
});

test("PR, fork, failed and superseded workflow runs cannot publish", async () => {
  for (const change of [
    (f) => (f.context.payload.workflow_run.event = "pull_request"),
    (f) =>
      (f.context.payload.workflow_run.head_repository.full_name =
        "someone/fork"),
    (f) => (f.context.payload.workflow_run.conclusion = "failure"),
    (f) =>
      (f.context.payload.workflow_run.path = ".github/workflows/other.yml"),
    (f) => (f.state.main = "b".repeat(40)),
    (f) => (f.state.pulls = []),
    (f) => (f.state.pulls[0].merge_commit_sha = "b".repeat(40)),
  ]) {
    const f = fixture();
    change(f);
    assert.equal(await resolveRelease(f.github, f.context), null);
  }
});

test("an older successful run cannot hide a newer failed or incomplete CI run", async () => {
  for (const conclusion of ["failure", "cancelled", null]) {
    const f = fixture();
    f.state.runs.push({
      run_number: 3,
      status: conclusion ? "completed" : "in_progress",
      conclusion,
    });
    await assert.rejects(
      resolveRelease(f.github, f.context),
      /must pass Compatibility/,
    );
  }
});

test("tag publication requires main ancestry, matching package version and exact CI", async () => {
  const f = fixture();
  f.context.eventName = "push";
  f.context.ref = "refs/tags/v0.1.1";
  assert.deepEqual(await resolveRelease(f.github, f.context), {
    sha,
    version: "0.1.1",
    channel: "latest",
  });
  f.state.pkg.version = "0.2.0-rc.1";
  f.context.ref = "refs/tags/v0.2.0-rc.1";
  assert.equal((await resolveRelease(f.github, f.context)).channel, "next");
  f.state.comparison = "diverged";
  await assert.rejects(resolveRelease(f.github, f.context), /commit on main/);
  f.state.comparison = "identical";
  f.state.runs = [];
  await assert.rejects(
    resolveRelease(f.github, f.context),
    /must pass Compatibility/,
  );
});
