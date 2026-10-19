import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export async function checkout(source) {
  const metadata = JSON.parse(
    await readFile(new URL("upstream.json", source), "utf8"),
  );
  const name = new URL(".", source).pathname.split("/").filter(Boolean).at(-1);
  const directory = fileURLToPath(
    new URL(`../../../artifacts/upstream/${name}/`, source),
  );
  await mkdir(directory, { recursive: true });
  const root = join(directory, "clone");
  const run = (command, args, cwd = root) =>
    execFileSync(command, args, { cwd, stdio: "inherit" });
  const clean = () =>
    assert.equal(
      execFileSync("git", ["status", "--porcelain"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
      "",
      "Upstream source must remain unchanged",
    );
  if (!existsSync(join(root, ".git")))
    run(
      "git",
      [
        "clone",
        "--filter=blob:none",
        "--no-checkout",
        metadata.repository,
        root,
      ],
      directory,
    );
  else clean();
  run("git", ["fetch", "--depth=1", "origin", metadata.commit]);
  run("git", ["checkout", "--detach", metadata.commit]);
  return { root, directory, run, clean };
}
