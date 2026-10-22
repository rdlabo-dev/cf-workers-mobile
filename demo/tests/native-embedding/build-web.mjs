import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const distribution = process.env.WORKERS_NPM_PACKAGE_DIR
  ? pathToFileURL(
      path.resolve(process.env.WORKERS_NPM_PACKAGE_DIR, "dist") + "/",
    )
  : new URL("../../../dist/", import.meta.url);
const { workersCapacitorPlugin } = await import(
  new URL("tooling/esbuild.js", distribution)
);

const platform = process.argv[2];
const scenario = process.argv[3] ?? "normal";
if (!["ios", "android"].includes(platform))
  throw new Error("Usage: node build-web.mjs ios|android");
if (!["normal", "startup-failure", "broken-entry"].includes(scenario))
  throw new Error("Scenario must be normal, startup-failure or broken-entry");
const root = new URL("./", import.meta.url);
const output = new URL(
  platform === "ios"
    ? "ios/Sources/Consumer/PrivateWeb/"
    : `android/app/src/main/assets/sdk-web${scenario === "normal" ? "" : scenario === "startup-failure" ? "-failure" : "-broken"}/`,
  root,
);
const entry = new URL(`${platform}.js`, distribution);
await mkdir(output, { recursive: true });
await build({
  absWorkingDir: fileURLToPath(root),
  stdin: {
    contents: `import { ${platform === "ios" ? "workersIOS" : "workersAndroid"} as create } from ${JSON.stringify(fileURLToPath(entry))};
const app = create({baseURL:"https://worker.invalid",render:"/"});
app.ready.catch(error => { console.error("EMBED_START_FAILED", error); });`,
    resolveDir: fileURLToPath(root),
    sourcefile: "native-entry.js",
  },
  outfile: fileURLToPath(new URL("main.js", output)),
  bundle: true,
  format: "esm",
  platform: "browser",
  plugins: [
    workersCapacitorPlugin({
      worker:
        scenario === "startup-failure" ? "./worker-failure.js" : "./worker.js",
      execution: "local",
    }),
  ],
});
await writeFile(
  new URL("index.html", output),
  `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module" src="/${scenario === "broken-entry" ? "missing-entry.js" : "main.js"}"></script>`,
);
