import { expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  symlink,
  realpath,
} from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { build as vite } from "vite";
import { workersCapacitorPlugin as esbuildPlugin } from "cf-workers-native/tooling/esbuild";
import { workersCapacitorPlugin as vitePlugin } from "cf-workers-native/tooling/vite";

const secret = "PRIVATE_DECLARED_FILE_ef271a";
const library = fileURLToPath(
  import.meta.resolve("cf-workers-native/capacitor"),
);
for (const tool of ["vite", "esbuild"] as const) {
  it(`${tool}: declared files stay remote and every supported distribution path rejects them`, async () => {
    const root = await realpath(
      await mkdtemp(resolve(tmpdir(), "server-only-")),
    );
    try {
      await mkdir(resolve(root, "public"));
      await writeFile(resolve(root, ".env"), "VITE_asset=./private.txt?inline");
      await writeFile(
        resolve(root, "private.ts"),
        `export const value = '${secret}';`,
      );
      await writeFile(resolve(root, "private.txt"), secret);
      await writeFile(resolve(root, "private.txt?url"), "public shadow file");
      await writeFile(resolve(root, "private.css"), `.x{--private: ${secret}}`);
      await writeFile(resolve(root, "import.css"), "@import './private.css';");
      await writeFile(resolve(root, "private#key.txt"), secret);
      await writeFile(
        resolve(root, "style.css"),
        ".private{background:url('./private.txt?inline')}",
      );
      await symlink(resolve(root, "private.ts"), resolve(root, "alias.ts"));
      await writeFile(
        resolve(root, "public.ts"),
        `export const PUBLIC_KEY = 'PUBLISHABLE_KEY';`,
      );
      await writeFile(
        resolve(root, "wrapper.ts"),
        "export {value} from './alias.ts';",
      );
      await writeFile(
        resolve(root, "worker.ts"),
        "import {Hono} from 'hono'; import {value} from './private.ts'; const app=new Hono(); app.get('/', c=>c.text(value)); export default app;",
      );
      const bootstrap = `import {workersCapacitor} from ${JSON.stringify(library)}; import {PUBLIC_KEY} from './public.ts'; globalThis.key=PUBLIC_KEY; globalThis.runtime=workersCapacitor({baseURL:'https://worker.example/'});`;
      const run = async (
        execution: "network" | "local" | { method: "GET"; path: string }[],
        extra = "",
        workerFiles: string[] = [],
        html: boolean | string = false,
      ) => {
        await writeFile(
          resolve(root, "main.ts"),
          extra || html || workerFiles.length ? extra : bootstrap,
        );
        await writeFile(
          resolve(root, "index.html"),
          typeof html === "string"
            ? html
            : '<script type="module" src="/main.ts"></script><img src="./private.txt?inline">',
        );
        const options = {
          worker: "worker.ts",
          execution,
          serverOnly: [
            "private.ts",
            "private.txt",
            "private#key.txt",
            "private.css",
          ],
          workerFiles,
        };
        if (tool === "esbuild") {
          const result = await esbuild({
            absWorkingDir: root,
            entryPoints: ["main.ts"],
            bundle: true,
            format: "esm",
            platform: "browser",
            outdir: "out",
            write: false,
            sourcemap: true,
            logLevel: "silent",
            loader: { ".txt": "file" },
            plugins: [esbuildPlugin(options)],
          });
          return result.outputFiles.map((file) => file.text).join("\n");
        }
        const result = await vite({
          root,
          configFile: false,
          define: {
            "import.meta.env.HTML_asset": JSON.stringify(
              "./private.txt?inline",
            ),
          },
          resolve: { alias: { "@private": resolve(root, "private.txt") } },
          logLevel: "silent",
          plugins: [vitePlugin(options)],
          build: {
            write: false,
            sourcemap: true,
            rollupOptions: {
              input: resolve(root, html ? "index.html" : "main.ts"),
            },
          },
        });
        return (Array.isArray(result) ? result : [result])
          .flatMap((bundle) => ("output" in bundle ? bundle.output : []))
          .map((item) =>
            item.type === "chunk"
              ? item.code + JSON.stringify(item.map)
              : String(item.source),
          )
          .join("\n");
      };
      for (const execution of [
        "network",
        [{ method: "GET", path: "/" }],
      ] as const) {
        const output = await run(
          execution === "network" ? execution : [...execution],
        );
        expect(output).not.toContain(secret);
        expect(output).not.toContain(Buffer.from(secret).toString("base64"));
        expect(output).toContain("PUBLISHABLE_KEY");
      }
      const forbidden = async (action: () => Promise<string>) => {
        let error: unknown;
        try {
          await action();
        } catch (caught) {
          error = caught;
        }
        expect(error).toBeDefined();
        expect(String(error)).toContain(
          "Declared server-only file cannot be distributed:",
        );
        expect(String(error)).not.toContain(secret);
      };
      await forbidden(() => run("local"));
      await forbidden(() =>
        run(
          "network",
          "import {value} from './private.ts'; globalThis.leak=value;",
        ),
      );
      await forbidden(() =>
        run(
          "network",
          "import {value} from './wrapper.ts'; globalThis.leak=value;",
        ),
      );
      await forbidden(() => run("network", "", ["private.txt"]));
      await forbidden(() => run("network", "", ["private#key.txt"]));
      await forbidden(() =>
        run(
          "network",
          tool === "vite"
            ? "import url from './private.txt?url'; globalThis.leak=url;"
            : "import url from './private.txt'; globalThis.leak=url;",
        ),
      );
      if (tool === "vite") {
        await forbidden(() =>
          run(
            "network",
            "globalThis.leak=new URL('@private', import.meta.url).href;",
          ),
        );
        await forbidden(() => run("network", "import './style.css';"));
        await forbidden(() => run("network", "import './import.css';"));
        await forbidden(() => run("network", "", [], true));
        await forbidden(() =>
          run("network", "", [], '<img src="%VITE_asset%">'),
        );
        await forbidden(() =>
          run("network", "", [], '<img src="%HTML_asset%">'),
        );
        const publicHtml = await run(
          "network",
          "",
          [],
          '<img src="%UNKNOWN%"><p>public</p>',
        );
        expect(publicHtml).toContain("public");
        await forbidden(() =>
          run(
            "network",
            "globalThis.leak=new URL('./private.txt?inline', import.meta.url).href;",
          ),
        );
        await symlink(
          resolve(root, "private.txt"),
          resolve(root, "public/copied.txt"),
        );
        await forbidden(() => run("network"));
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 60000);
}
