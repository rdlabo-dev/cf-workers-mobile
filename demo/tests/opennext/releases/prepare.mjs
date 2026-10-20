import {
  cp,
  mkdir,
  readFile,
  writeFile,
  rm,
  realpath,
  symlink,
} from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";

const run = promisify(execFile);
const source = fileURLToPath(new URL("../../../opennext/", import.meta.url));
const output = fileURLToPath(
  new URL("../../../artifacts/opennext-releases/", import.meta.url),
);
await mkdir(output, { recursive: true });
for (const release of ["A", "B"]) {
  const root = join(output, release);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  for (const file of [
    "app",
    "public",
    "migrations",
    "middleware.ts",
    "package.json",
    "tsconfig.json",
    "next-env.d.ts",
    "open-next.config.ts",
    "wrangler.jsonc",
  ])
    await cp(join(source, file), join(root, file), { recursive: true });
  // OpenNext rewrites traced dependency paths relative to each application.
  // A shared node_modules symlink leaves native sharp paths outside that graph.
  await cp(join(source, "node_modules"), join(root, "node_modules"), {
    recursive: true,
    mode: constants.COPYFILE_FICLONE,
    verbatimSymlinks: true,
  });
  const library = join(root, "node_modules/cf-workers-mobile");
  await rm(library, { recursive: true, force: true });
  await symlink(
    await realpath(join(source, "node_modules/cf-workers-mobile")),
    library,
    "dir",
  );
  await writeFile(
    join(root, "next.config.mjs"),
    `export default {output:"standalone",generateBuildId:async()=>${JSON.stringify("acceptance-" + release)}};`,
  );
  const layout = join(root, "app/layout.tsx");
  await writeFile(
    layout,
    (await readFile(layout, "utf8")).replace(
      "<main>",
      `<main data-release="${release}">`,
    ),
  );
  // Change a real client chunk as well as the build ID and server HTML. Keeping
  // HTTP route contracts stable is the explicitly tested rollout condition.
  const counter = join(root, "app/counter.tsx");
  await writeFile(
    counter,
    (await readFile(counter, "utf8")).replace(
      'id="counter"',
      `id="counter" data-release="${release}"`,
    ),
  );
  try {
    const result = await run("npm", ["run", "build:worker"], {
      cwd: root,
      maxBuffer: 32 * 1024 * 1024,
    });
    await writeFile(
      join(output, `${release}-build.log`),
      result.stdout + result.stderr,
    );
  } catch (error) {
    await writeFile(
      join(output, `${release}-build.log`),
      (error.stdout ?? "") + (error.stderr ?? ""),
    );
    throw error;
  }
  console.log(`Prepared release ${release}`);
}
const actions = await Promise.all(
  ["A", "B"].map(async (release) =>
    JSON.parse(
      await readFile(
        join(output, release, ".next/server/server-reference-manifest.json"),
        "utf8",
      ),
    ),
  ),
);
assert.notEqual(
  actions[0].encryptionKey,
  actions[1].encryptionKey,
  "Releases must be independent builds",
);
console.log("Prepared independent old-client A and new-Worker B builds");
