import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { serverBindings, compileServerWorker } from "../../src/build/server.js";
import { serverModules } from "../../src/build/server-modules.js";
async function selector(source: string) {
  const result = await build({
    stdin: { contents: source, resolveDir: root },
    bundle: true,
    format: "esm",
    write: false,
  });
  return (await import(
    /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
  )) as { needsRemote(request: Request): Promise<boolean> };
}
let root: string;
beforeAll(async () => {
  await mkdir("demo/artifacts", { recursive: true });
  root = await mkdtemp(resolve("demo/artifacts/services-compiler-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
const kinds = [
  ["r2_buckets", "r2Bindings", "BUCKET"],
  ["services", "serviceBindings", "SERVICE"],
  ["queues", "queueBindings", "QUEUE"],
] as const;
for (const [key, option, binding] of kinds) {
  it(`discovers standalone ${key} and removes its server operations`, async () => {
    const group = [
      {
        binding,
        id: "private-id",
        bucket_name: "private-bucket",
        service: "private-service",
        queue: "private-queue",
      },
    ];
    await writeFile(
      resolve(root, "wrangler.jsonc"),
      JSON.stringify({
        [key]: key === "queues" ? { producers: group } : group,
      }),
    );
    const found = await serverBindings(root, {});
    expect(found.names).toEqual([binding]);
    expect(found.reportFile).toBe("capacitor-workers-server.json");
    expect(JSON.stringify(found)).not.toMatch(
      /private-id|private-bucket|private-service|private-queue/,
    );
    await writeFile(
      resolve(root, "worker.ts"),
      `import {Hono} from 'hono'; const app=new Hono(); app.get('/health',c=>c.text('ok')); app.post('/remote',async c=>c.json(await c.env.${binding}.send('private-code-marker')));export default app;`,
    );
    const compiled = await serverModules(
      resolve(root, "worker.ts"),
      root,
      {},
    ).get();
    expect(compiled?.mode).toBe("routes");
    expect(compiled?.local).not.toContain("private-code-marker");
    const { needsRemote } = await selector(compiled!.selector);
    expect(
      await needsRemote(
        new Request("https://local.invalid/remote", { method: "POST" }),
      ),
    ).toBe(true);
    expect(await needsRemote(new Request("https://local.invalid/health"))).toBe(
      false,
    );
    expect(
      (
        await serverBindings(root, {
          [option]: ["OVERRIDE"],
          d1Bindings: ["DB"],
        })
      ).names,
    ).toContain("OVERRIDE");
    await expect(
      serverBindings(root, { localBindings: [binding] }),
    ).rejects.toThrow("cannot also");
  });
  it(`detects ${key} in named TOML environments and rejects malformed bindings`, async () => {
    const file = "named.toml";
    await writeFile(
      resolve(root, file),
      `[[env.production.${key}${key === "queues" ? ".producers" : ""}]]\nbinding="${binding}"`,
    );
    expect((await serverBindings(root, { workerConfig: file })).names).toEqual([
      binding,
    ]);
    await writeFile(
      resolve(root, "invalid.json"),
      JSON.stringify({ [key]: key === "queues" ? { producers: [{}] } : [{}] }),
    );
    await expect(
      serverBindings(root, { workerConfig: "invalid.json" }),
    ).rejects.toThrow(`Invalid ${key}`);
  });
}
it("keeps KV-only routes local when configured and mixed R2/KV operations remote", async () => {
  await writeFile(
    resolve(root, "local.json"),
    JSON.stringify({
      kv_namespaces: [{ binding: "KV" }],
      r2_buckets: [{ binding: "BUCKET" }],
    }),
  );
  const config = await serverBindings(root, {
    workerConfig: "local.json",
    kvExecution: { KV: "local" },
  });
  expect(config.names).toEqual(["BUCKET"]);
  expect(config.localBindings).toEqual(["KV"]);
  const entry = resolve(root, "worker.ts");
  await writeFile(
    entry,
    `import {Hono} from 'hono';const app=new Hono();app.get('/local/:key',async c=>c.text(await c.env.KV.get(c.req.param('key'))));app.get('/cloud/:key',async c=>{const value=await c.env.KV.get(c.req.param('key'));const object=await c.env.BUCKET.get(c.req.param('key'));return c.json({value,object});});export default app;`,
  );
  const compiled = await serverModules(entry, root, {
    workerConfig: "local.json",
    kvExecution: { KV: "local" },
  }).get();
  expect(compiled?.mode).toBe("routes");
  const { needsRemote } = await selector(compiled!.selector);
  expect(await needsRemote(new Request("https://local.invalid/local/a"))).toBe(
    false,
  );
  expect(await needsRemote(new Request("https://local.invalid/cloud/a"))).toBe(
    true,
  );
  expect(compiled!.local).not.toContain("BUCKET");
  expect(compiled!.local).toContain("KV.get");
});
it("does not create a remote boundary for a KV-only Worker", async () => {
  await writeFile(
    resolve(root, "kv.json"),
    JSON.stringify({ kv_namespaces: [{ binding: "KV" }] }),
  );
  const config = await serverBindings(root, {
    workerConfig: "kv.json",
    kvExecution: { KV: "local" },
  });
  expect(config.names).toEqual([]);
  expect(config.localBindings).toEqual(["KV"]);
  expect(
    await serverModules(resolve(root, "worker.ts"), root, {
      workerConfig: "kv.json",
      kvExecution: { KV: "local" },
    }).get(),
  ).toBeUndefined();
  expect(
    (
      await serverBindings(root, {
        workerConfig: "kv.json",
        kvBindings: ["OVERRIDE"],
        kvExecution: { OVERRIDE: "local" },
      })
    ).localBindings,
  ).toEqual(["OVERRIDE"]);
  await writeFile(
    resolve(root, "kv.toml"),
    '[[env.production.kv_namespaces]]\nbinding="NAMED_KV"',
  );
  expect(
    (
      await serverBindings(root, {
        workerConfig: "kv.toml",
        kvExecution: { NAMED_KV: "local" },
      })
    ).localBindings,
  ).toEqual(["NAMED_KV"]);
  await writeFile(
    resolve(root, "badkv.json"),
    JSON.stringify({ kv_namespaces: [{}] }),
  );
  await expect(
    serverBindings(root, { workerConfig: "badkv.json" }),
  ).rejects.toThrow("Invalid kv_namespaces");
});
it("keeps mixed-kind names server-only even when the same name is also KV", async () => {
  await writeFile(
    resolve(root, "collision.json"),
    JSON.stringify({
      kv_namespaces: [{ binding: "SHARED" }],
      services: [{ binding: "SHARED" }],
    }),
  );
  await expect(
    serverBindings(root, {
      workerConfig: "collision.json",
      kvExecution: { SHARED: "local" },
      localBindings: ["SHARED"],
    }),
  ).rejects.toThrow("cannot also");
});
it("does not mistake queue consumers for producer bindings", async () => {
  await writeFile(
    resolve(root, "consumer.json"),
    JSON.stringify({ queues: { consumers: [{ queue: "server-consumer" }] } }),
  );
  expect(
    (await serverBindings(root, { workerConfig: "consumer.json" })).names,
  ).toEqual([]);
  for (const queues of [null, [], 42]) {
    await writeFile(resolve(root, "invalid.json"), JSON.stringify({ queues }));
    await expect(
      serverBindings(root, { workerConfig: "invalid.json" }),
    ).rejects.toThrow("Invalid queues");
  }
});

it("does not confuse dynamic R2/KV keys with Cookie header access", async () => {
  const entry = resolve(root, "dynamic.ts");
  await writeFile(
    entry,
    `import {Hono} from 'hono';const app=new Hono();app.get('/health',c=>c.text('ok'));app.get('/object/:key',async c=>c.json(await c.env.BUCKET.get(c.req.param('key'))));app.delete('/key/:key',async c=>{await c.env.KV.delete(c.req.param('key'));return c.body(null,204);});export default app;`,
  );
  const result = await compileServerWorker(entry, ["BUCKET", "KV"]);
  expect(result.mode).toBe("routes");
  const { needsRemote } = await selector(result.selector);
  expect(await needsRemote(new Request("https://local.invalid/health"))).toBe(
    false,
  );
  expect(await needsRemote(new Request("https://local.invalid/object/a"))).toBe(
    true,
  );
  expect(
    await needsRemote(
      new Request("https://local.invalid/key/a", { method: "DELETE" }),
    ),
  ).toBe(true);
});
it("keeps consumer-only Workers and their fetch handlers on the server", async () => {
  await writeFile(
    resolve(root, "consumer-only.json"),
    JSON.stringify({ queues: { consumers: [{ queue: "jobs" }] } }),
  );
  const entry = resolve(root, "consumer.ts");
  await writeFile(
    entry,
    `export default {fetch(){return new Response('consumer-private-code')},queue(batch,env){return env.INTERNAL_SECRET}};`,
  );
  const result = await serverModules(entry, root, {
    workerConfig: "consumer-only.json",
  }).get();
  expect(result?.mode).toBe("worker");
  expect(result?.reason).toContain("Queue consumers");
  expect(result?.local).not.toContain("consumer-private-code");
  expect(result?.reportFile).toBe("capacitor-workers-server.json");
});

it("requires explicit KV policy and rejects invalid or conflicting policies", async () => {
  const workerConfig = "policy.json";
  await writeFile(
    resolve(root, workerConfig),
    JSON.stringify({ kv_namespaces: [{ binding: "KV" }] }),
  );
  await expect(serverBindings(root, { workerConfig })).rejects.toThrow(
    "Set kvExecution.KV",
  );
  for (const policy of [
    null,
    [],
    "local",
    { KV: "invalid" },
    { KV: "local", TYPO: "remote" },
  ])
    await expect(
      serverBindings(root, { workerConfig, kvExecution: policy as never }),
    ).rejects.toThrow();
  await expect(
    serverBindings(root, {
      workerConfig,
      kvExecution: { KV: "remote" },
      localBindings: ["KV"],
    }),
  ).rejects.toThrow("cannot also");
  const found = await serverBindings(root, {
    workerConfig,
    kvExecution: { KV: "remote" },
  });
  expect(found.names).toEqual(["KV"]);
  expect(found.localBindings).toEqual([]);
  expect(found.reportFile).toBe("capacitor-workers-server.json");
  const entry = resolve(root, "remote-kv.ts");
  await writeFile(
    entry,
    `import {Hono} from 'hono';const app=new Hono();app.get('/health',c=>c.text('ok'));app.get('/kv/:key',async c=>c.text(await c.env.KV.get(c.req.param('key'))));export default app;`,
  );
  const result = await serverModules(entry, root, {
    workerConfig,
    kvExecution: { KV: "remote" },
  }).get();
  const { needsRemote } = await selector(result!.selector);
  expect(await needsRemote(new Request("https://local.invalid/kv/a"))).toBe(
    true,
  );
  expect(await needsRemote(new Request("https://local.invalid/health"))).toBe(
    false,
  );
});
