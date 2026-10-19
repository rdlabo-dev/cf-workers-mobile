import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import assert from "node:assert/strict";
const meta = JSON.parse(
  await readFile(new URL("upstream.json", import.meta.url), "utf8"),
);
const root = fileURLToPath(
  new URL("../../../artifacts/upstream/minvoice/", import.meta.url),
);
await mkdir(root, { recursive: true });
const clone = join(root, "clone");
const run = (cmd, args, cwd = root) =>
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
if (!existsSync(join(clone, ".git")))
  run("git", ["clone", "--no-checkout", meta.repository, clone]);
run("git", ["fetch", "origin", meta.commit], clone);
run("git", ["checkout", "--detach", meta.commit], clone);
run("npm", ["ci"], clone);
assert.equal(
  execFileSync("git", ["status", "--porcelain"], {
    cwd: clone,
    encoding: "utf8",
  }).trim(),
  "",
  "Upstream checkout must remain unchanged",
);
