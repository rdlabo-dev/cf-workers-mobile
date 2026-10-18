import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { serverBindings } from "../../src/tooling/server.js";
import { serverModules } from "../../src/tooling/server-modules.js";
let root: string;
beforeAll(async () => {
  await mkdir("demo/artifacts", { recursive: true });
  root = await mkdtemp(resolve("demo/artifacts/cloudflare-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
async function configuration(config: unknown) {
  await writeFile(resolve(root, "wrangler.json"), JSON.stringify(config));
}
async function selector(code: string) {
  const result = await build({
    stdin: { contents: code, resolveDir: root },
    bundle: true,
    format: "esm",
    write: false,
  });
  return import(
    /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
  );
}
const configurations = [
  { durable_objects: { bindings: [{ name: "CLOUD", class_name: "Counter" }] } },
  ...[
    "vectorize",
    "workflows",
    "analytics_engine_datasets",
    "mtls_certificates",
    "dispatch_namespaces",
    "secrets_store_secrets",
    "ai_search",
    "ai_search_namespaces",
  ].map((key) => ({ [key]: [{ binding: "CLOUD" }] })),
  ...["ai", "browser", "images", "stream", "media", "analytics"].map((key) => ({
    [key]: { binding: "CLOUD" },
  })),
  { ratelimits: [{ name: "CLOUD" }] },
  { send_email: [{ name: "CLOUD" }] },
];
for (const config of configurations) {
  const kind = Object.keys(config)[0];
  it(`${kind}: detects named environments, strips server operations and preserves local routes`, async () => {
    await configuration({ env: { production: config } });
    const found = await serverBindings(root, {});
    expect(found.names).toEqual(["CLOUD"]);
    expect(found.reportFile).toBe("workers-capacitor-server.json");
    await expect(
      serverBindings(root, { localBindings: ["CLOUD"] }),
    ).rejects.toThrow("cannot also");
    const entry = resolve(root, "worker.ts");
    await writeFile(
      entry,
      `import {Hono} from 'hono';const app=new Hono();app.get('/health',c=>c.text('local'));app.post('/cloud',async c=>c.json(await c.env.CLOUD.run('private-cloud-operation')));export default app;`,
    );
    const compiled = await serverModules(entry, root, {}).get();
    expect(compiled?.mode).toBe("routes");
    expect(compiled!.local).not.toContain("private-cloud-operation");
    const { needsRemote } = await selector(compiled!.selector);
    expect(await needsRemote(new Request("https://local.invalid/health"))).toBe(
      false,
    );
    expect(
      await needsRemote(
        new Request("https://local.invalid/cloud", { method: "POST" }),
      ),
    ).toBe(true);
    await configuration({ [kind]: null });
    await expect(serverBindings(root, {})).rejects.toThrow(`Invalid ${kind}`);
  });
}
it("detects TOML Durable Object names, AI singleton and Workflow arrays together", async () => {
  await writeFile(
    resolve(root, "named.toml"),
    `[env.production.ai]\nbinding="AI"\n[[env.production.durable_objects.bindings]]\nname="OBJECTS"\nclass_name="Counter"\n[[env.production.workflows]]\nbinding="JOBS"\nname="jobs"\nclass_name="Job"`,
  );
  expect(
    (await serverBindings(root, { workerConfig: "named.toml" })).names,
  ).toEqual(["OBJECTS", "JOBS", "AI"]);
});
it("rejects unknown binding-shaped configuration unless explicitly remote, including unsafe name bindings", async () => {
  for (const config of [
    { future: [{ binding: "NEXT" }] },
    { unsafe: { bindings: [{ name: "NEXT", type: "future" }] } },
    { version_metadata: { binding: "NEXT" } },
  ]) {
    await configuration(config);
    await expect(serverBindings(root, {})).rejects.toThrow(
      "Add it to remoteBindings",
    );
    await expect(
      serverBindings(root, { localBindings: ["NEXT"] }),
    ).rejects.toThrow("Unsupported binding");
    expect(
      (await serverBindings(root, { remoteBindings: ["NEXT"] })).names,
    ).toEqual(["NEXT"]);
  }
  await configuration({ future: [{ binding: null }] });
  await expect(
    serverBindings(root, { remoteBindings: ["NEXT"] }),
  ).rejects.toThrow("Invalid binding");
});
it("adds remote secrets without copying values and rejects conflicting or invalid names", async () => {
  await configuration({
    vars: { LABEL: { binding: "ordinary-value" } },
    ai: { binding: "AI" },
  });
  expect(
    (await serverBindings(root, { remoteBindings: ["SECRET"] })).names,
  ).toEqual(["AI", "SECRET"]);
  await expect(
    serverBindings(root, {
      remoteBindings: ["SECRET"],
      localBindings: ["SECRET"],
    }),
  ).rejects.toThrow("cannot also");
  for (const values of [null, "AI", [""]])
    await expect(
      serverBindings(root, { remoteBindings: values as never }),
    ).rejects.toThrow("nonempty");
});
it("keeps exported cloud classes and scheduled handlers wholly remote even without a binding", async () => {
  const entry = resolve(root, "exports.ts");
  await writeFile(
    entry,
    `export default {fetch(){return new Response('private-code')}}`,
  );
  for (const config of [
    { exports: { Counter: { type: "durable-object", storage: "sqlite" } } },
    { exports: { Job: { type: "workflow", name: "job" } } },
    { triggers: { crons: ["* * * * *"] } },
  ]) {
    await configuration(config);
    const compiled = await serverModules(entry, root, {}).get();
    expect(compiled?.mode).toBe("worker");
    expect(compiled?.local).not.toContain("private-code");
  }
});

const assets = { binding: "ASSETS", run_worker_first: true };
it("requires explicit remote ASSETS policy and rejects local policies", async () => {
  await configuration({ assets });
  await expect(serverBindings(root, {})).rejects.toThrow("Set assetsExecution");
  await expect(
    serverBindings(root, { assetsExecution: "local" as never }),
  ).rejects.toThrow("local ASSETS compatibility is not implemented");
  expect(
    (await serverBindings(root, { assetsExecution: "remote" })).names,
  ).toEqual(["ASSETS"]);
  await configuration({});
  await expect(
    serverBindings(root, { assetsExecution: "remote" }),
  ).rejects.toThrow("requires assets");
});
it("preserves asset-first routing remotely and selectively dispatches worker-first asset calls", async () => {
  for (const config of [
    { binding: "ASSETS" },
    { run_worker_first: ["/api/*"], binding: "ASSETS" },
    { directory: "public" },
  ]) {
    await configuration({ assets: config });
    expect(
      (await serverBindings(root, { assetsExecution: "remote" }))
        .forceRemoteReason,
    ).toContain("Asset-first");
  }
  await configuration({ assets, ai: { binding: "AI" } });
  const entry = resolve(root, "assets.ts");
  await writeFile(
    entry,
    `import {Hono} from 'hono';const app=new Hono();app.get('/health',c=>c.text('ok'));app.get('/assets',c=>c.env.ASSETS.fetch(c.req.raw));app.get('/cloud',async c=>{await c.env.AI.run('private-model');return c.env.ASSETS.fetch(c.req.raw)});export default app;`,
  );
  const compiled = await serverModules(entry, root, {
    assetsExecution: "remote",
  }).get();
  const { needsRemote } = await selector(compiled!.selector);
  expect(await needsRemote(new Request("https://local.invalid/health"))).toBe(
    false,
  );
  expect(await needsRemote(new Request("https://local.invalid/assets"))).toBe(
    true,
  );
  expect(await needsRemote(new Request("https://local.invalid/cloud"))).toBe(
    true,
  );
  expect(compiled?.local).not.toContain("private-model");
  expect(compiled?.local).not.toContain("ASSETS.fetch");
  await expect(
    serverBindings(root, {
      assetsExecution: "remote",
      localBindings: ["ASSETS"],
    }),
  ).rejects.toThrow("cannot also");
});

it("remote assets can import server WASM and binary files without shipping them or bypassing the source guard", async () => {
  await configuration({ assets: { binding: "ASSETS", directory: "public" } });
  const entry = resolve(root, "binary-worker.js");
  await writeFile(
    entry,
    `import wasm from './renderer.wasm?module'; import font from './font.bin'; export default {fetch() { return new Response(String(wasm) + font + 'private-renderer'); }};`,
  );
  await writeFile(resolve(root, "renderer.wasm"), "private-wasm");
  await writeFile(resolve(root, "font.bin"), "private-font");
  const graph = serverModules(entry, root, { assetsExecution: "remote" });
  const compiled = await graph.get();
  expect(compiled?.mode).toBe("worker");
  expect(compiled?.local).not.toMatch(/private-|renderer|font/);
  expect(compiled?.inputs).toContain(entry);
  expect(
    compiled?.inputs.some((path) => path.endsWith("renderer.wasm?module")),
  ).toBe(true);
  expect(compiled?.inputs).toContain(resolve(root, "font.bin"));
  await expect(graph.guard(entry)).rejects.toThrow(
    "outside the generated Worker graph",
  );
});
