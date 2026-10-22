import { setTimeout as delay } from "node:timers/promises";

// np pushes the version commit and tag together. Wait for main CI to catch up;
// resolveRelease and the publishing job still revalidate the exact candidate.
export async function waitForReleaseCI(
  github,
  context,
  { sleep = delay, attempts = 110, interval = 30000, log = () => {} } = {},
) {
  if (context.eventName !== "push" || !context.ref.startsWith("refs/tags/v"))
    throw new Error("Release CI waiting requires a release tag push");
  const repo = context.repo;
  const { data: commit } = await github.rest.repos.getCommit({
    ...repo,
    ref: context.ref,
  });
  const { data: main } = await github.rest.repos.getBranch({
    ...repo,
    branch: "main",
  });
  const { data: comparison } = await github.rest.repos.compareCommits({
    ...repo,
    base: commit.sha,
    head: main.commit.sha,
  });
  if (!["ahead", "identical"].includes(comparison.status))
    throw new Error("Release tag must refer to a commit on main");

  for (let attempt = 0; attempt < attempts; attempt++) {
    const runs = await github.paginate(github.rest.actions.listWorkflowRuns, {
      ...repo,
      workflow_id: "ci.yml",
      head_sha: commit.sha,
      event: "push",
      branch: "main",
      per_page: 100,
    });
    const latest = runs.sort((a, b) => b.run_number - a.run_number)[0];
    if (latest?.status === "completed") {
      if (latest.conclusion !== "success")
        throw new Error(`Main Compatibility failed: ${latest.conclusion}`);
      return;
    }
    log(
      `Waiting for main Compatibility at ${commit.sha} (${attempt + 1}/${attempts})`,
    );
    if (attempt + 1 < attempts) await sleep(interval);
  }
  throw new Error("Timed out waiting for main Compatibility");
}
