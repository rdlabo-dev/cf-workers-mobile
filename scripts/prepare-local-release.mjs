import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = (command, args, cwd = root) =>
  execFileSync(command, args, { cwd, encoding: "utf8" }).trim();
if (process.argv.length !== 2)
  throw new Error("Usage: npm run release:prepare (no arguments)");
if (run("git", ["status", "--porcelain", "--untracked-files=normal"]))
  throw new Error("Commit or stash local changes before preparing a release.");

const sha = run("git", ["rev-parse", "HEAD"]);
const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
const source = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
if (source.name !== "cf-workers-mobile")
  throw new Error("Unexpected package name.");
const base = source.version
  .match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-|$)/)?.[0]
  .replace(/-$/, "");
if (!base) throw new Error("Invalid source package version.");
const version = `${base}-beta.local.sha${sha.slice(0, 12)}`;
const output = join(root, "artifacts", "npm", sha);
const staging = await mkdtemp(join(tmpdir(), "cf-workers-mobile-release-"));
try {
  // Build through the ordinary prepack hook, then change only staged metadata.
  const [built] = JSON.parse(
    run("npm", ["pack", "--json", "--pack-destination", staging]),
  );
  run("tar", ["-xzf", join(staging, built.filename), "-C", staging]);
  const directory = join(staging, "package");
  const file = join(directory, "package.json");
  const pkg = JSON.parse(await readFile(file, "utf8"));
  pkg.version = version;
  pkg.gitHead = sha;
  pkg.publishConfig = {
    ...pkg.publishConfig,
    access: "public",
    tag: "beta",
    registry: "https://registry.npmjs.org",
  };
  await writeFile(file, `${JSON.stringify(pkg, null, 2)}\n`);
  await mkdir(output, { recursive: true });
  const [packed] = JSON.parse(
    run(
      "npm",
      ["pack", "--json", "--ignore-scripts", "--pack-destination", output],
      directory,
    ),
  );
  const tarball = join(output, packed.filename);
  const sha256 = createHash("sha256")
    .update(await readFile(tarball))
    .digest("hex");
  await writeFile(
    join(output, "release.json"),
    `${JSON.stringify({ name: pkg.name, version, tag: "beta", branch, sha, tarball, sha256 }, null, 2)}\n`,
  );
  // Shell quoting for a reviewable command, never execute publication here.
  const quoted = `'${tarball.replaceAll("'", "'\\''")}'`;
  console.log(`Prepared ${pkg.name}@${version} from ${branch} (${sha}).`);
  console.log(`SHA-256: ${sha256}`);
  console.log(
    `npm publish ${quoted} --ignore-scripts --access public --tag beta --registry https://registry.npmjs.org`,
  );
} finally {
  await rm(staging, { recursive: true, force: true });
}
