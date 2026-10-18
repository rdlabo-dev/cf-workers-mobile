import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { context, type BuildResult } from "esbuild";
import { expect, it } from "vitest";
import { capacitorWorkersPlugin } from "@rdlabo/capacitor-workers/esbuild";

it("watches Worker dependencies and emits a new asset without writing output", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "capacitor-workers-watch-"));
  const results: BuildResult[] = [];
  await writeFile(resolve(dir, "value.js"), 'export default "before-change";');
  await writeFile(
    resolve(dir, "worker.js"),
    'import value from "./value.js"; export default {fetch() {return new Response(value)}};',
  );
  await writeFile(
    resolve(dir, "main.js"),
    `import {capacitorWorkers} from ${JSON.stringify(fileURLToPath(import.meta.resolve("@rdlabo/capacitor-workers")))}; globalThis.runtime = capacitorWorkers({baseURL:"https://worker.invalid/api"});`,
  );
  const build = await context({
    absWorkingDir: dir,
    entryPoints: ["main.js"],
    outdir: "out",
    bundle: true,
    format: "esm",
    write: false,
    plugins: [
      capacitorWorkersPlugin({ worker: "worker.js" }),
      {
        name: "capture",
        setup(build) {
          build.onEnd((result) => {
            results.push(result);
          });
        },
      },
    ],
  });
  try {
    await build.watch();
    await expect
      .poll(() => results.length, { timeout: 5000 })
      .toBeGreaterThan(0);
    const asset = (result: BuildResult) =>
      result.outputFiles?.find((file) => !file.path.endsWith("/main.js"));
    expect(results[0].errors).toEqual([]);
    expect(asset(results[0])?.text).toContain("before-change");
    await writeFile(resolve(dir, "value.js"), 'export default "after-change";');
    await expect
      .poll(() => asset(results.at(-1)!)?.text, { timeout: 5000 })
      .toContain("after-change");
    expect(asset(results.at(-1)!)?.path).not.toBe(asset(results[0])?.path);
  } finally {
    await build.dispose();
    await rm(dir, { recursive: true, force: true });
  }
}, 15000);
