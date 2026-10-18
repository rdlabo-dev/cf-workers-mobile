import { cp, mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const root = process.cwd();
const temp = await mkdtemp(join(tmpdir(), "capacitor-workers-consumer-"));
const pack = JSON.parse(
  execFileSync("npm", ["pack", "--json", "--pack-destination", temp], {
    encoding: "utf8",
  }),
)[0];
for (const module of ["path", "querystring", "string-decoder"]) {
  for (const name of ["LICENSE-3RD-PARTY.md", "LICENSE-APACHE"]) {
    const notice = `dist/compat/${module}/${name}`;
    if (!pack.files.some((file) => file.path === notice))
      throw new Error(`Missing upstream license notice in tarball: ${notice}`);
  }
}
for (const name of ["NOTICE", "LICENSE-APACHE", "LICENSE-MIT"]) {
  const notice = `dist/compat/brotli/${name}`;
  if (!pack.files.some((file) => file.path === notice))
    throw new Error(
      `Missing bundled codec license notice in tarball: ${notice}`,
    );
}
await writeFile(
  join(temp, "package.json"),
  JSON.stringify({ name: "fresh-consumer", private: true, type: "module" }),
);
execFileSync(
  "npm",
  [
    "install",
    join(temp, pack.filename),
    "vite@7.3.7",
    "esbuild@0.28.2",
    "hono@4.13.13",
    "express@5.3.0",
    "@capacitor/core@8.5.3",
    "typescript@7.0.2",
  ],
  { cwd: temp, stdio: "pipe" },
);
// The consumer test needs web sources only, not native projects/build outputs.
for (const entry of [
  "tests/scripts/build-tools.mjs",
  "src",
  "tests/validation",
  "tests/fixtures",
]) {
  await cp(join("demo", entry), join(temp, "demo", entry), { recursive: true });
}
// Candidate Web API contracts use internal modules from the installed tarball.
// Never copy library implementation sources from the checkout.
await cp(
  join(temp, "node_modules/@rdlabo/capacitor-workers/dist/compat"),
  join(temp, "src/compat"),
  { recursive: true },
);
// Copy module-owned contracts separately; these are not shipped.
for (const module of [
  "path",
  "querystring",
  "string-decoder",
  "http",
  "net",
  "headers",
  "request",
  "response",
  "immediate",
  "structured-clone",
  "encoding",
  "abort",
]) {
  const directory = join("src", "compat", module);
  await mkdir(join(temp, directory), { recursive: true });
  await cp(
    join(directory, "index.spec.ts"),
    join(temp, directory, "index.spec.ts"),
  );
}
await writeFile(
  join(temp, "vite.config.mjs"),
  `import { capacitorWorkersPlugin } from '@rdlabo/capacitor-workers/vite';
export default {root:'demo/tests/validation',plugins:[capacitorWorkersPlugin()],build:{outDir:'../../../build',target:'es2022'}};`,
);
execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
  cwd: temp,
  stdio: "pipe",
});
await writeFile(
  join(temp, "consumer.ts"),
  `/// <reference types="@rdlabo/capacitor-workers/cloudflare" />
import worker from "./demo/src/workers/hono/standard";
import { httpServerHandler } from "cloudflare:node";
const handler = httpServerHandler({ port: 3000 });
const response: Promise<Response> = handler.fetch(new Request("https://worker.invalid/api"));
// @ts-expect-error Logical ports must be numeric.
httpServerHandler({ port: "3000" });
import { capacitorWorkers, FetchRuntime, type WorkerContext } from "@rdlabo/capacitor-workers";
class ExampleRuntime extends FetchRuntime<{ label: string }> {
  protected dispatch(request: Request, env: { label: string }, ctx: WorkerContext) {
    ctx.waitUntil(Promise.resolve());
    return new Response(env.label + request.method);
  }
}
import { defineFeature, FeatureImplementation, openFeature } from "@rdlabo/capacitor-workers/features";
import { runContract, type ContractSuite } from "@rdlabo/capacitor-workers/testing";
import { kvContract } from "@rdlabo/capacitor-workers/testing/kv";
import { fetchContract, fetchContractWorker } from "@rdlabo/capacitor-workers/testing/fetch";
import { LocalStorageKV } from "@rdlabo/capacitor-workers/features/kv";
import { FetchImplementation } from "@rdlabo/capacitor-workers/features/fetch";
void runContract(new LocalStorageKV("consumer-test"), kvContract);
const kv = new LocalStorageKV("consumer-test").create();
const bytes: Promise<ArrayBuffer | null> = kv.get("key", "arrayBuffer");
const json: Promise<{ value: number } | null> = kv.get<{ value: number }>("key", "json");
const metadata: Promise<{ value: string | null; metadata: { tag: string } | null }> = kv.getWithMetadata<{ tag: string }>("key");
// @ts-expect-error Workers bulk reads cannot return streams.
void kv.get(["key"], "stream");
// @ts-expect-error Write options are checked statically as well as at runtime.
void kv.put("key", "value", { expirationTtl: "60" });

void runContract(new FetchImplementation({ worker: fetchContractWorker, baseURL: "https://worker.invalid/api" }), fetchContract);
// @ts-expect-error A KV implementation cannot use the HTTP contract.
void runContract(new LocalStorageKV("consumer-test"), fetchContract);
const feature = defineFeature<{ value(): number }>()("consumer", ["value"]);
const incompatibleFeature = defineFeature<{ value(): string }>()("consumer", ["value"]);
// @ts-expect-error Published declarations must preserve API invariance.
const invalidFeature: typeof feature = incompatibleFeature;
class InvalidImplementation extends FeatureImplementation<typeof feature> {
  // @ts-expect-error Wrong API result must fail against published declarations.
  create() { return { value: () => "wrong" }; }
}
class Implementation extends FeatureImplementation<typeof feature> {
  constructor() { super(feature, { value: { status: "supported" } }); }
  create() { return { value: () => 1 }; }
}
const suite: ContractSuite<typeof feature> = { feature, cases: { value(api) { const value: number = api.value(); } } };
void runContract(new Implementation(), suite);
void openFeature(new Implementation()).then(session => {
  const value: number = session.api.value();
  // @ts-expect-error Public API inference must not degrade to any.
  session.api.missing();
  return session.dispose();
});
const example = new ExampleRuntime({ baseURL: "https://worker.invalid/api", env: { label: "local" } });
const fetcher: typeof fetch = example.fetch;
example.dispose();
const runtime = capacitorWorkers({worker, baseURL:"https://worker.invalid/api"});
const ready: Promise<void> = runtime.ready;
// @ts-expect-error Worker handlers must not degrade to any.
const invalid: number = worker;
runtime.dispose();
`,
);
execFileSync(
  process.execPath,
  [
    "node_modules/typescript/bin/tsc",
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "--moduleResolution",
    "bundler",
    "--module",
    "esnext",
    "--target",
    "es2022",
    "consumer.ts",
  ],
  { cwd: temp, stdio: "pipe" },
);
const child = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4189",
    "--strictPort",
  ],
  { cwd: temp, stdio: "pipe" },
);
let browser;
try {
  const deadline = Date.now() + 20000;
  while (true) {
    try {
      if ((await fetch("http://127.0.0.1:4189")).ok) break;
    } catch {}
    if (child.exitCode !== null || Date.now() > deadline)
      throw new Error("Consumer preview failed to start");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:4189/");
  await page.waitForFunction(() => window.pocDone);
  const results = await page.evaluate(() => window.pocResults);
  if (results?.length !== 26 || results.some((r) => !r.ok))
    throw new Error(await page.locator("pre").innerText());
  // Rebuild the same installed tarball consumer using the public isolated import.
  await writeFile(
    join(temp, "vite.config.mjs"),
    `import { capacitorWorkersPlugin } from '@rdlabo/capacitor-workers/vite';
export default {root:'demo/tests/fixtures/apps/runtime',plugins:[capacitorWorkersPlugin({worker:'../../workers/runtime/isolation.ts'})],build:{outDir:'../../../../../build',emptyOutDir:true,target:'es2022'}};`,
  );
  execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
    cwd: temp,
    stdio: "pipe",
  });
  await page.goto("http://127.0.0.1:4189");
  await page.waitForFunction(
    () => typeof window.startExperiment === "function",
  );
  const isolated = [];
  for (const framework of ["hono", "express"]) {
    await page.evaluate(async (framework) => {
      window.experiment = window.startExperiment(
        location.origin,
        "https://worker.invalid/api",
        framework,
      );
      await window.experiment.ready;
    }, framework);
    await page.context().setOffline(true);
    try {
      const checks = await page.evaluate(async (framework) => {
        const results = await window.runFrameworkContract(framework);
        await window.experiment.drain();
        if (window.experiment.errors.length)
          throw new Error("Background errors");
        return results;
      }, framework);
      if (checks.length !== 11 || checks.some((r) => !r.ok))
        throw new Error(JSON.stringify(checks));
      isolated.push(...checks);
    } finally {
      await page.evaluate(() => window.experiment.dispose());
      await page.context().setOffline(false);
    }
  }
  for (const prefer of ["worker", "direct"]) {
    const result = await page.evaluate(async (prefer) => {
      const runtime = window.startPreferred(prefer);
      try {
        await runtime.ready;
        const response = await fetch("/api/echo", {
          method: "POST",
          body: "packed preference",
        });
        return { execution: runtime.execution, text: await response.text() };
      } finally {
        runtime.dispose();
      }
    }, prefer);
    if (result.execution !== prefer || result.text !== "packed preference")
      throw new Error(JSON.stringify(result));
  }
  const features = await page.evaluate(() => window.runFeatures());
  if (
    features.flatMap((report) => report.cases).length !== 162 ||
    features.some(
      (report) =>
        report.errors.length ||
        report.cases.some((test) => test.status !== "passed"),
    )
  )
    throw new Error(JSON.stringify(features));
  execFileSync(process.execPath, ["demo/tests/scripts/build-tools.mjs"], {
    cwd: temp,
    stdio: "pipe",
  });
  await cp(
    join(temp, "demo/artifacts/build-tools"),
    join(temp, "build/build-tools"),
    { recursive: true },
  );
  for (const build of [
    "vite-hono",
    "vite-express",
    "esbuild-hono",
    "esbuild-express",
    "raw",
  ]) {
    for (const prefer of ["worker", "direct"]) {
      await page.goto(`http://127.0.0.1:4189/build-tools/${build}/`);
      await page.waitForFunction(
        () => typeof window.runBuildTool === "function",
      );
      const report = await page.evaluate(
        (prefer) => window.runBuildTool(prefer),
        prefer,
      );
      if (
        report.execution !== prefer ||
        report.cases.length !== (build === "raw" ? 4 : 9) ||
        report.cases.some((result) => !result.ok)
      )
        throw new Error(`${build}/${prefer}: ${JSON.stringify(report)}`);
    }
  }
  console.log("Packed consumer: Vite/esbuild/browser ESM 10/10 passed");
  // Installed package, cold Vite dev optimization, subpath-only application.
  const dev = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--config",
      "demo/tests/fixtures/apps/build-tools/vite.config.ts",
      "--host",
      "127.0.0.1",
      "--port",
      "4187",
      "--strictPort",
      "--force",
    ],
    { cwd: temp, stdio: "pipe" },
  );
  let devOutput = "";
  dev.stdout.on("data", (chunk) => {
    devOutput += chunk;
  });
  dev.stderr.on("data", (chunk) => {
    devOutput += chunk;
  });
  try {
    const deadline = Date.now() + 60000;
    let readiness = "No response";
    while (true) {
      try {
        const response = await fetch("http://127.0.0.1:4187/features.html", {
          signal: AbortSignal.timeout(3000),
        });
        if (response.ok) break;
        readiness = `${response.status}: ${await response.text()}`;
      } catch (error) {
        readiness = String(error);
      }
      if (dev.exitCode !== null || Date.now() > deadline)
        throw new Error(
          `Consumer dev server failed to start: ${readiness}\n${devOutput}`,
        );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    page.on("requestfailed", (request) =>
      console.error("Consumer request:", request.url(), request.failure()),
    );
    page.on("pageerror", (error) => console.error("Consumer page:", error));
    page.on("console", (message) => {
      if (message.type() === "error")
        console.error("Consumer console:", message.text());
    });
    await page.goto("http://127.0.0.1:4187/features.html");
    await page.waitForFunction(
      () => typeof window.runConfiguredFeature === "function",
    );
    for (const prefer of ["worker", "direct"]) {
      const report = await page.evaluate(
        (prefer) => window.runConfiguredFeature(prefer),
        prefer,
      );
      if (
        !report.unchanged ||
        report.cases.length !== 9 ||
        report.cases.some((result) => !result.ok)
      )
        throw new Error(JSON.stringify(report));
    }
    console.log(
      "Packed consumer: configured Fetch subpath in Vite dev 2/2 passed",
    );
  } catch (error) {
    console.error(devOutput);
    throw error;
  } finally {
    dev.kill("SIGTERM");
  }
  await mkdir(resolve(root, "artifacts"), { recursive: true });
  await writeFile(
    resolve(root, "artifacts/package-results.json"),
    JSON.stringify(
      { consumer: temp, direct: results, isolated, features },
      null,
      2,
    ),
  );
  console.log(
    `Packed consumer: direct ${results.length}/26, isolated ${isolated.length}/22, common features ${features.flatMap((report) => report.cases).length} passed, 0 exclusions, preferences 2/2 passed (${temp})`,
  );
} finally {
  await browser?.close();
  child.kill("SIGTERM");
}
