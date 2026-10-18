import { execFileSync } from "node:child_process";
import { cp, readFile, writeFile, mkdir, rm, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const here = fileURLToPath(new URL(".", import.meta.url));
const root = fileURLToPath(
  new URL("../../../artifacts/upstream/opennext/", import.meta.url),
);
const meta = JSON.parse(await readFile(join(here, "upstream.json"), "utf8"));
execFileSync(
  process.execPath,
  [
    fileURLToPath(
      new URL("../../scripts/prepare-upstream.mjs", import.meta.url),
    ),
    "opennext",
    "--clone-only",
  ],
  { stdio: "inherit" },
);
// Preserve the upstream directory layout and all application code. Only monorepo
// dependency placeholders are resolved for this standalone test installation.
for (const name of ["e2e/app-router", "e2e/shared", "common"]) {
  await rm(join(root, name), { recursive: true, force: true });
  await mkdir(join(root, name), { recursive: true });
  await cp(join(root, "clone/examples", name), join(root, name), {
    recursive: true,
  });
}
for (const name of ["app-router", "shared"]) {
  const path = join(root, "e2e", name, "package.json");
  const pkg = JSON.parse(await readFile(path, "utf8"));
  for (const section of ["dependencies", "devDependencies", "peerDependencies"])
    for (const dependency of Object.keys(pkg[section] ?? {})) {
      if (!(dependency in meta.dependencies))
        throw new Error(`Unpinned dependency: ${dependency}`);
      pkg[section][dependency] = meta.dependencies[dependency];
    }
  await writeFile(path, JSON.stringify(pkg, null, 2));
}
const app = join(root, "e2e/app-router");
await cp(join(here, "package-lock.json"), join(app, "package-lock.json"));
execFileSync("npm", ["ci", "--install-links"], { cwd: app, stdio: "inherit" });
execFileSync(
  process.execPath,
  ["node_modules/@opennextjs/cloudflare/dist/cli/index.js", "build"],
  { cwd: app, stdio: "inherit" },
);

// Assert every upstream application/configuration file survives preparation and
// compilation byte-for-byte. Only package manifests resolve workspace catalogs.
for (const name of ["e2e/app-router", "e2e/shared", "common"]) {
  const source = join(root, "clone/examples", name);
  for (const file of await readdir(source, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!file.isFile() || file.name === "package.json") continue;
    const relative = join(file.parentPath.slice(source.length), file.name);
    const original = await readFile(join(source, relative));
    const prepared = await readFile(join(root, name, relative));
    if (!original.equals(prepared))
      throw new Error(`Upstream source changed: ${name}/${relative}`);
  }
}
