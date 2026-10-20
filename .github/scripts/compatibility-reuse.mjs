import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workflow = ".github/workflows/ci.yml";
const evidenceName = (attempt) => `compatibility-checkout-${attempt}`;
const fallback = (reason) => ({ reuse: false, reason });

export async function readEvidence(github, repo, run) {
  const { data } = await github.rest.actions.listWorkflowRunArtifacts({
    ...repo,
    run_id: run.id,
    per_page: 100,
  });
  const matches = data.artifacts.filter(
    (item) => item.name === evidenceName(run.run_attempt),
  );
  if (matches.length !== 1) return null;
  const artifact = matches[0];
  if (artifact.expired || artifact.size_in_bytes > 16384) return null;
  const download = await github.rest.actions.downloadArtifact({
    ...repo,
    artifact_id: artifact.id,
    archive_format: "zip",
  });
  const directory = await mkdtemp(join(tmpdir(), "compatibility-evidence-"));
  try {
    const file = join(directory, "evidence.zip");
    await writeFile(file, Buffer.from(download.data));
    const options = { encoding: "utf8", maxBuffer: 8192, timeout: 10000 };
    const entries = execFileSync("unzip", ["-Z1", file], options).trim();
    if (entries !== "checkout.json") return null;
    return JSON.parse(
      execFileSync("unzip", ["-p", file, "checkout.json"], options),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Reuse only the latest successful PR run of the exact checked-out source tree. */
export async function resolveReuse({
  github,
  context,
  tree,
  commit,
  read = (run) => readEvidence(github, context.repo, run),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  timeoutMs = 45 * 60 * 1000,
}) {
  if (context.eventName !== "push" || context.ref !== "refs/heads/main")
    return fallback("Only main pushes reuse PR checks");
  const repo = context.repo;
  const fullName = `${repo.owner}/${repo.repo}`;
  let pr;
  let workflowId;
  try {
    const associated = await github.paginate(
      github.rest.repos.listPullRequestsAssociatedWithCommit,
      { ...repo, commit_sha: commit, per_page: 100 },
    );
    const matches = associated.filter(
      (item) =>
        item.merged_at &&
        item.base.ref === "main" &&
        item.base.repo.full_name === fullName,
    );
    if (matches.length !== 1) return fallback("No unique merged PR");
    pr = matches[0];
    workflowId = (
      await github.rest.actions.getWorkflow({ ...repo, workflow_id: "ci.yml" })
    ).data.id;
  } catch {
    return fallback("Cannot establish PR provenance");
  }
  const deadline = now() + timeoutMs;
  for (;;) {
    if (now() >= deadline) throw new Error("PR Compatibility wait timed out");
    let run;
    let evidence;
    try {
      const runs = await github.paginate(github.rest.actions.listWorkflowRuns, {
        ...repo,
        workflow_id: "ci.yml",
        event: "pull_request",
        head_sha: pr.head.sha,
        per_page: 100,
      });
      run = runs
        .filter(
          (item) =>
            item.event === "pull_request" &&
            item.workflow_id === workflowId &&
            item.repository?.full_name === fullName &&
            item.path?.split("@")[0] === workflow &&
            item.head_sha === pr.head.sha &&
            (!item.pull_requests?.length ||
              item.pull_requests.some((item) => item.number === pr.number)),
        )
        .sort((a, b) => b.run_number - a.run_number || b.id - a.id)[0];
      if (!run) return fallback("No matching PR run");
      // Pending runs may not have uploaded their evidence yet. Never use an
      // earlier run/attempt's success while the latest one is pending.
      if (run.status !== "completed") {
        if (now() >= deadline)
          throw new Error("PR Compatibility wait timed out");
        await sleep(Math.min(15000, deadline - now()));
        continue;
      }
      evidence = await read(run);
      if (
        !evidence ||
        evidence.repository !== fullName ||
        evidence.runId !== run.id ||
        evidence.attempt !== run.run_attempt ||
        evidence.head !== pr.head.sha ||
        evidence.pr !== pr.number ||
        !/^[a-f0-9]{40}$/.test(evidence.commit) ||
        evidence.tree !== tree
      )
        return fallback("Missing or different checkout evidence");
      const checked = await github.rest.repos.getCommit({
        ...repo,
        ref: evidence.commit,
      });
      if (
        checked.data.commit.tree.sha !== tree ||
        checked.data.parents.length !== 2 ||
        checked.data.parents[1].sha !== pr.head.sha
      )
        return fallback("Evidence does not identify the PR test merge");
      // Re-read after artifact/API work: reruns or newer runs supersede this result.
      const latest = await github.rest.actions.getWorkflowRun({
        ...repo,
        run_id: run.id,
      });
      if (
        latest.data.run_attempt !== run.run_attempt ||
        latest.data.status !== "completed"
      )
        continue;
    } catch (error) {
      if (error.message === "PR Compatibility wait timed out") throw error;
      return fallback("Cannot verify checkout evidence");
    }
    // Check for a newly created run too, not just a rerun of this run ID.
    try {
      const { data } = await github.rest.actions.listWorkflowRuns({
        ...repo,
        workflow_id: "ci.yml",
        event: "pull_request",
        head_sha: pr.head.sha,
        per_page: 1,
      });
      if (data.workflow_runs[0]?.id !== run.id) continue;
    } catch {
      return fallback("Cannot establish latest PR run");
    }
    if (run.conclusion !== "success")
      throw new Error(`PR Compatibility ${run.id} concluded ${run.conclusion}`);
    return {
      reuse: true,
      runId: run.id,
      reason: "Exact PR checkout tree passed",
    };
  }
}
