import { afterAll, expect, it } from "vitest";
import { build as viteBuild } from "vite";
import { build as esbuildBuild } from "esbuild";
import { workersCapacitorPlugin as vitePlugin } from "cf-workers-mobile/tooling/vite";
import { workersCapacitorPlugin as esbuildPlugin } from "cf-workers-mobile/tooling/esbuild";
import { cp, mkdtemp, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const directories: string[] = [];
afterAll(async () => {
  for (const directory of directories)
    await rm(directory, { recursive: true, force: true });
});
for (const framework of ["hono", "express"])
  for (const builder of ["vite", "esbuild", "esbuild-outfile"]) {
    it(`${builder}/${framework}: defaults Worker execution to network while retaining bundled public assets`, async () => {
      const outdir = await mkdtemp(join(tmpdir(), "capacitor-documents-"));
      directories.push(outdir);
      const root = resolve("tests/fixtures/apps/public-documents");
      const worker = resolve(
        `tests/fixtures/workers/rendering/${framework}.${framework === "hono" ? "tsx" : "ts"}`,
      );
      const publicDir = resolve("tests/fixtures/apps/native-documents/public");
      if (builder === "vite")
        await viteBuild({
          configFile: false,
          root,
          publicDir,
          logLevel: "silent",
          plugins: [vitePlugin({ worker })],
          build: { outDir: outdir, emptyOutDir: true },
        });
      else {
        // esbuild has no publicDir: copy public assets before building so the
        // plugin records them in the same native document manifest as Vite.
        await cp(publicDir, outdir, { recursive: true });
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
      }
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
      expect(manifest).toContain("/rendering/module.js");
      expect(manifest).toContain("/rendering/style.css");
      expect(manifest).toContain("/rendering/pixel.svg");
      for (const asset of ["style.css", "pixel.svg"]) {
        expect(await readFile(join(outdir, "rendering", asset), "utf8")).toBe(
          await readFile(join(publicDir, "rendering", asset), "utf8"),
        );
      }
      const report = JSON.parse(
        await readFile(join(outdir, "workers-capacitor-server.json"), "utf8"),
      );
      expect(report.mode).toBe("worker");
      expect(
        report.routes.every((route: { remote: boolean }) => route.remote),
      ).toBe(true);
      expect(await readFile(join(outdir, "rendering/module.js"), "utf8")).toBe(
        await readFile(join(publicDir, "rendering/module.js"), "utf8"),
      );
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
