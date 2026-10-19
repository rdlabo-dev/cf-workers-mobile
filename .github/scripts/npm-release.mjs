const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const prerelease =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)$/;

export function releaseVersion(version, tag, pr, sha) {
  if (!stable.test(version) && !prerelease.test(version)) {
    throw new Error(`Invalid package version: ${version}`);
  }
  if (tag) {
    if (tag !== `v${version}`)
      throw new Error("Tag must match package.json version");
    return { version, channel: stable.test(version) ? "latest" : "next" };
  }
  return {
    version: `${version.split("-")[0]}-beta.pr${pr}.sha${sha.slice(0, 12)}`,
    channel: "beta",
  };
}

export async function resolveRelease(github, context) {
  const repo = context.repo;
  const { data: main } = await github.rest.repos.getBranch({
    ...repo,
    branch: "main",
  });
  let sha;
  let pr;
  let tag;
  if (context.eventName === "workflow_run") {
    const run = context.payload.workflow_run;
    if (
      run.event !== "push" ||
      run.head_branch !== "main" ||
      run.head_repository.full_name !== `${repo.owner}/${repo.repo}` ||
      run.path !== ".github/workflows/ci.yml" ||
      run.conclusion !== "success" ||
      run.head_sha !== main.commit.sha
    )
      return null;
    sha = run.head_sha;
    const pulls = await github.paginate(
      github.rest.repos.listPullRequestsAssociatedWithCommit,
      {
        ...repo,
        commit_sha: sha,
        per_page: 100,
      },
    );
    pr = pulls.find(
      (p) => p.merged_at && p.base.ref === "main" && p.merge_commit_sha === sha,
    )?.number;
    if (!pr) return null; // Direct pushes do not release beta packages.
  } else if (
    context.eventName === "push" &&
    context.ref.startsWith("refs/tags/v")
  ) {
    tag = context.ref.slice("refs/tags/".length);
    const { data: commit } = await github.rest.repos.getCommit({
      ...repo,
      ref: context.ref,
    });
    sha = commit.sha;
    const { data: comparison } = await github.rest.repos.compareCommits({
      ...repo,
      base: sha,
      head: main.commit.sha,
    });
    if (!["ahead", "identical"].includes(comparison.status)) {
      throw new Error("Release tags must point to a commit on main");
    }
  } else return null;

  // Require the latest main CI run for this exact commit, including tag releases.
  const runs = await github.paginate(github.rest.actions.listWorkflowRuns, {
    ...repo,
    workflow_id: "ci.yml",
    head_sha: sha,
    event: "push",
    branch: "main",
    per_page: 100,
  });
  const latest = runs.sort((a, b) => b.run_number - a.run_number)[0];
  if (
    !latest ||
    latest.status !== "completed" ||
    latest.conclusion !== "success"
  ) {
    throw new Error(
      "The exact release commit must pass Compatibility on main first",
    );
  }
  const { data: file } = await github.rest.repos.getContent({
    ...repo,
    path: "package.json",
    ref: sha,
  });
  const pkg = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
  if (pkg.name !== "workers-capacitor")
    throw new Error("Unexpected package name");
  return { sha, ...releaseVersion(pkg.version, tag, pr, sha) };
}
