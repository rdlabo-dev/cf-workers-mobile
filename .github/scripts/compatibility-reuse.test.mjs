import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readEvidence, resolveReuse } from "./compatibility-reuse.mjs";

function fixture() {
  const head = "a".repeat(40);
  const tree = "b".repeat(40);
  const commit = "c".repeat(40);
  const state = {
    time: 0,
    waits: 0,
    run: {
      id: 12,
      run_number: 5,
      run_attempt: 1,
      event: "pull_request",
      workflow_id: 9,
      repository: { full_name: "owner/repo" },
      path: ".github/workflows/ci.yml",
      head_sha: head,
      pull_requests: [{ number: 3 }],
      status: "completed",
      conclusion: "success",
    },
    evidence: {
      repository: "owner/repo",
      runId: 12,
      attempt: 1,
      pr: 3,
      head,
      commit,
      tree,
    },
    pr: {
      number: 3,
      merged_at: "date",
      base: { ref: "main", repo: { full_name: "owner/repo" } },
      head: { sha: head },
    },
    checked: {
      commit: { tree: { sha: tree } },
      parents: [{ sha: "d".repeat(40) }, { sha: head }],
    },
  };
  const actions = {
    getWorkflow: async () => ({ data: { id: 9 } }),
    listWorkflowRuns: async () => ({ data: { workflow_runs: [state.run] } }),
    getWorkflowRun: async () => ({ data: state.run }),
  };
  const repos = {
    listPullRequestsAssociatedWithCommit: async () => ({ data: [state.pr] }),
    getCommit: async () => ({ data: state.checked }),
  };
  const github = {
    rest: { actions, repos },
    paginate: async (method, params) => {
      const { data } = await method(params);
      return data.workflow_runs ?? data;
    },
  };
  const options = {
    github,
    context: {
      eventName: "push",
      ref: "refs/heads/main",
      repo: { owner: "owner", repo: "repo" },
    },
    commit,
    tree,
    read: async () => state.evidence,
    now: () => state.time,
    sleep: async (ms) => {
      state.waits++;
      state.time += ms;
      state.run.status = "completed";
    },
    timeoutMs: 30000,
  };
  return { state, options, actions, repos };
}

test("reuse the exact test merge tree, including after the PR association closes", async () => {
  const { state, options } = fixture();
  state.run.pull_requests = [];
  assert.equal((await resolveReuse(options)).reuse, true);
});

test("different tree, absent evidence, or wrong attempt fall back to full CI", async () => {
  for (const mutate of [
    (s) => {
      s.evidence.tree = "e".repeat(40);
    },
    (s) => {
      s.evidence = null;
    },
    (s) => {
      s.evidence.attempt = 0;
    },
    (s) => {
      s.evidence.pr = 4;
    },
    (s) => {
      s.evidence.runId = 11;
    },
    (s) => {
      s.checked.parents[1].sha = "e".repeat(40);
    },
    (s) => {
      s.checked.commit.tree.sha = "e".repeat(40);
    },
  ]) {
    const { state, options } = fixture();
    mutate(state);
    assert.equal((await resolveReuse(options)).reuse, false);
  }
});

test("a pending latest PR run is awaited instead of accepting an earlier success", async () => {
  const { state, options } = fixture();
  state.run.status = "in_progress";
  assert.equal((await resolveReuse(options)).reuse, true);
  assert.equal(state.waits, 1);
});

test("pending PR run has a finite deadline", async () => {
  const { state, options } = fixture();
  state.run.status = "queued";
  options.sleep = async (ms) => {
    state.time += ms;
  };
  await assert.rejects(resolveReuse(options), /wait timed out/);
});

test("matching failed, cancelled, and timed-out runs fail the main release gate", async () => {
  for (const conclusion of ["failure", "cancelled", "timed_out", "skipped"]) {
    const { state, options } = fixture();
    state.run.conclusion = conclusion;
    await assert.rejects(resolveReuse(options), new RegExp(conclusion));
  }
});

test("a newer failed run supersedes an older successful run", async () => {
  const { state, options, actions } = fixture();
  const older = { ...state.run, id: 11, run_number: 4 };
  state.run.conclusion = "failure";
  actions.listWorkflowRuns = async () => ({
    data: { workflow_runs: [older, state.run] },
  });
  // A per_page=1 response must still identify the newest run.
  const original = actions.listWorkflowRuns;
  actions.listWorkflowRuns = async (params) =>
    params.per_page === 1
      ? { data: { workflow_runs: [state.run] } }
      : original(params);
  await assert.rejects(resolveReuse(options), /concluded failure/);
});

test("a rerun started during evidence verification invalidates the old attempt", async () => {
  const { state, options, actions } = fixture();
  let reads = 0;
  actions.getWorkflowRun = async () => {
    if (reads++ === 0) {
      state.run = { ...state.run, run_attempt: 2, conclusion: "failure" };
      state.evidence = { ...state.evidence, attempt: 2 };
    }
    return { data: state.run };
  };
  await assert.rejects(resolveReuse(options), /concluded failure/);
});

test("a newly created run during verification also supersedes the candidate", async () => {
  const { state, options, actions } = fixture();
  let changed = false;
  actions.listWorkflowRuns = async (params) => {
    if (params.per_page === 1 && !changed) {
      changed = true;
      state.run = {
        ...state.run,
        id: 13,
        run_number: 6,
        conclusion: "failure",
      };
      state.evidence = { ...state.evidence, runId: 13 };
    }
    return { data: { workflow_runs: [state.run] } };
  };
  await assert.rejects(resolveReuse(options), /13 concluded failure/);
});

test("foreign repository, event, workflow, or PR never qualifies", async () => {
  for (const mutate of [
    (s) => {
      s.run.repository.full_name = "other/repo";
    },
    (s) => {
      s.run.event = "push";
    },
    (s) => {
      s.run.workflow_id = 10;
    },
    (s) => {
      s.run.path = ".github/workflows/other.yml";
    },
    (s) => {
      s.run.pull_requests = [{ number: 99 }];
    },
  ]) {
    const { state, options } = fixture();
    mutate(state);
    assert.equal((await resolveReuse(options)).reuse, false);
  }
});

test("no merged PR, non-main events, and API/artifact errors run full CI", async () => {
  const scenarios = [
    ({ state }) => {
      state.pr.merged_at = null;
    },
    ({ options }) => {
      options.context.eventName = "pull_request";
    },
    ({ actions }) => {
      actions.listWorkflowRuns = async () => {
        throw new Error("network");
      };
    },
    ({ options }) => {
      options.read = async () => {
        throw new Error("bad ZIP");
      };
    },
  ];
  for (const mutate of scenarios) {
    const f = fixture();
    mutate(f);
    assert.equal((await resolveReuse(f.options)).reuse, false);
  }
});

test("artifact reader accepts only the current attempt's single small JSON", async () => {
  const directory = await mkdtemp(join(tmpdir(), "reuse-zip-test-"));
  try {
    await writeFile(join(directory, "checkout.json"), '{"tree":"checked"}');
    execFileSync("zip", ["-q", "evidence.zip", "checkout.json"], {
      cwd: directory,
    });
    const archive = await readFile(join(directory, "evidence.zip"));
    let artifacts = [
      {
        id: 2,
        name: "compatibility-checkout-2",
        size_in_bytes: archive.length,
        expired: false,
      },
    ];
    const github = {
      rest: {
        actions: {
          listWorkflowRunArtifacts: async () => ({ data: { artifacts } }),
          downloadArtifact: async () => ({ data: archive }),
        },
      },
    };
    const run = { id: 1, run_attempt: 2 };
    assert.deepEqual(await readEvidence(github, {}, run), { tree: "checked" });
    artifacts[0].name = "compatibility-checkout-1";
    assert.equal(await readEvidence(github, {}, run), null);
    artifacts[0].name = "compatibility-checkout-2";
    artifacts.push({ ...artifacts[0] });
    assert.equal(await readEvidence(github, {}, run), null);
    artifacts.pop();
    artifacts[0].size_in_bytes = 16385;
    assert.equal(await readEvidence(github, {}, run), null);
    artifacts[0].size_in_bytes = archive.length;
    await writeFile(join(directory, "unexpected.txt"), "not evidence");
    execFileSync("zip", ["-q", "evidence.zip", "unexpected.txt"], {
      cwd: directory,
    });
    github.rest.actions.downloadArtifact = async () => ({
      data: await readFile(join(directory, "evidence.zip")),
    });
    assert.equal(await readEvidence(github, {}, run), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the actual CI aggregator rejects failed gates and inconsistent job results", async () => {
  const yaml = await readFile(
    new URL("../workflows/ci.yml", import.meta.url),
    "utf8",
  );
  const marker = "        run: |\n";
  const script = yaml
    .slice(yaml.lastIndexOf(marker) + marker.length)
    .replace(/^          /gm, "");
  const keys = [
    "LIBRARY",
    "COMPATIBILITY",
    "BINDINGS",
    "STREAMS",
    "PACKAGE",
    "UPSTREAM",
  ];
  const base = {
    ...process.env,
    CHECKOUT: "success",
    REUSE: "false",
    ...Object.fromEntries(keys.map((key) => [key, "success"])),
  };
  const execute = (env) =>
    execFileSync("bash", ["-e", "-c", script], { env, stdio: "pipe" });
  execute(base);
  const reused = {
    ...base,
    REUSE: "true",
    ...Object.fromEntries(keys.map((key) => [key, "skipped"])),
  };
  execute(reused);
  for (const env of [
    { ...reused, CHECKOUT: "failure" },
    { ...reused, PACKAGE: "failure" },
    { ...base, PACKAGE: "skipped" },
    { ...base, COMPATIBILITY: "cancelled" },
  ])
    assert.throws(() => execute(env));
});
