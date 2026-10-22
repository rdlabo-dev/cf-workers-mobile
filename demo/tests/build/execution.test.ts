import { expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { build as vite } from "vite";
import { workersCapacitorPlugin as esbuildPlugin } from "cf-workers-native/tooling/esbuild";
import { workersCapacitorPlugin as vitePlugin } from "cf-workers-native/tooling/vite";

for (const tool of ["vite", "esbuild"] as const)
  for (const execution of ["local", "network"] as const)
    it(`${tool}: ${execution} preserves the runtime-file distribution boundary`, async () => {
      const root = await mkdtemp(resolve(tmpdir(), "execution-files-"));
      try {
        const metadata = JSON.stringify({
          secretMarker: "SERVER_METADATA_MUST_NOT_SHIP",
        });
        const generated = resolve(root, "generated");
        const next = resolve(generated, "server-functions/default/.next");
        await mkdir(next, { recursive: true });
        await writeFile(resolve(next, "required-server-files.json"), metadata);
        await writeFile(resolve(next, "prerender-manifest.json"), metadata);
        const publicFile = "Explicit public runtime template";
        await writeFile(resolve(root, "template.txt"), publicFile);
        await writeFile(
          resolve(generated, "worker.js"),
          `export default {fetch(){return new Response('public')}};`,
        );
        const entry = resolve(root, "main.js");
        await writeFile(
          entry,
          `import {workersCapacitor} from ${JSON.stringify(fileURLToPath(import.meta.resolve("cf-workers-native/capacitor")))}; globalThis.runtime = workersCapacitor({baseURL:'https://local.invalid/'});`,
        );
        const options = {
          worker: resolve(generated, "worker.js"),
          execution,
          workerFiles: ["template.txt"],
        };
        let output: string;
        if (tool === "esbuild") {
          const result = await esbuild({
            absWorkingDir: root,
            entryPoints: [entry],
            bundle: true,
            format: "esm",
            platform: "browser",
            outdir: resolve(root, "out"),
            write: false,
            sourcemap: true,
            logLevel: "silent",
            plugins: [esbuildPlugin(options)],
          });
          output = result.outputFiles.map((file) => file.text).join("\n");
        } else {
          const result = await vite({
            root,
            configFile: false,
            publicDir: false,
            logLevel: "silent",
            plugins: [vitePlugin(options)],
            build: {
              write: false,
              sourcemap: true,
              rollupOptions: { input: entry },
            },
          });
          output = (Array.isArray(result) ? result : [result])
            .flatMap((bundle) => ("output" in bundle ? bundle.output : []))
            .map((item) =>
              item.type === "chunk" ? item.code : String(item.source),
            )
            .join("\n");
        }
        expect(output).toContain(Buffer.from(publicFile).toString("base64"));
        expect(output).not.toContain("SERVER_METADATA_MUST_NOT_SHIP");
        expect(output).not.toContain(Buffer.from(metadata).toString("base64"));
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }, 30000);
