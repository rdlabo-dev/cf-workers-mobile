import { afterAll, expect, it } from "vitest";
import { build as viteBuild } from "vite";
import { build as esbuildBuild } from "esbuild";
import { workersCapacitorPlugin as vitePlugin } from "workers-capacitor/tooling/vite";
import { workersCapacitorPlugin as esbuildPlugin } from "workers-capacitor/tooling/esbuild";
import { mkdtemp, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const directories: string[] = [];
afterAll(async () => {
  for (const directory of directories)
    await rm(directory, { recursive: true, force: true });
});
for (const framework of ["hono", "express"])
  for (const builder of ["vite", "esbuild", "esbuild-outfile"]) {
    it(`${builder}/${framework}: emits assets for the public rendering entry`, async () => {
      const outdir = await mkdtemp(join(tmpdir(), "capacitor-documents-"));
      directories.push(outdir);
      const root = resolve("tests/fixtures/apps/public-documents");
      const worker = resolve(
        `tests/fixtures/workers/rendering/${framework}.${framework === "hono" ? "tsx" : "ts"}`,
      );
      if (builder === "vite")
        await viteBuild({
          configFile: false,
          root,
          logLevel: "silent",
          plugins: [vitePlugin({ worker })],
          build: { outDir: outdir, emptyOutDir: true },
        });
      else
        await esbuildBuild({
          entryPoints: [join(root, "main.ts")],
          bundle: true,
          format: "esm",
          platform: "browser",
          ...(builder === "esbuild-outfile"
            ? { outfile: join(outdir, "main.js") }
            : { outdir }),
          plugins: [esbuildPlugin({ worker })],
          logLevel: "silent",
        });
      const manifest = JSON.parse(
        await readFile(join(outdir, "workers-capacitor-assets.json"), "utf8"),
      );
      for (const file of await readdir(outdir, {
        recursive: true,
        withFileTypes: true,
      })) {
        if (file.isFile())
          expect(manifest).toContain(
            "/" +
              (await import("node:path"))
                .relative(outdir, join(file.parentPath, file.name))
                .replaceAll("\\", "/"),
          );
      }
      expect(manifest).toContain("/index.html");
      expect(manifest).toContain("/workers-capacitor-sw.js");
      expect(manifest).not.toContain("/");
      expect(
        manifest.some(
          (path: string) =>
            path.endsWith(".js") && path !== "/workers-capacitor-sw.js",
        ),
      ).toBe(true);
      expect(
        await readFile(join(outdir, "workers-capacitor-sw.js"), "utf8"),
      ).toContain("__workers_capacitor_host");
    }, 30000);
  }
