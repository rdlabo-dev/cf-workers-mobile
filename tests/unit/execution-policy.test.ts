import { expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { serverModules } from "../../src/tooling/server-modules.js";
import type { ServerBuildOptions } from "../../src/tooling/server.js";

async function fixture(
  options: ServerBuildOptions,
  check: (graph: ReturnType<typeof serverModules>) => Promise<void>,
  source?: string,
  config?: object,
) {
  await mkdir("demo/artifacts", { recursive: true });
  const root = await mkdtemp(resolve("demo/artifacts/execution-"));
  try {
    await writeFile(
      resolve(root, "worker.ts"),
      source ??
        `import {Hono} from 'hono'; const app = new Hono();
      const settings = {title:'public', privateKey:'DISTRIBUTION_PERMISSION_CANARY'};
      app.get('/', c => c.text('public'));
      app.get('/configured', c => c.text(settings.title));
      app.post('/notes', async c => c.text(await c.req.text()));
      app.get('/cloud', c => c.text(c.env.SECRET));
      export default app;`,
    );
    if (config)
      await writeFile(resolve(root, "wrangler.json"), JSON.stringify(config));
    await check(serverModules(resolve(root, "worker.ts"), root, options));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
async function load(source: string) {
  const result = await build({
    stdin: { contents: source, resolveDir: resolve("demo") },
    bundle: true,
    format: "esm",
    write: false,
  });
  return import(
    /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.text).toString("base64")}`
  );
}
it("auto checks non-response data and unknown env without any cloud binding declaration", async () => {
  await fixture({}, async (graph) => {
    const result = (await graph.get())!;
    expect(result.local).not.toContain("DISTRIBUTION_PERMISSION_CANARY");
    const { needsRemote } = await load(result.selector);
    expect(await needsRemote(new Request("https://local.invalid/"))).toBe(
      false,
    );
    expect(
      await needsRemote(new Request("https://local.invalid/configured")),
    ).toBe(true);
    expect(await needsRemote(new Request("https://local.invalid/cloud"))).toBe(
      true,
    );
  });
});
it("network emits no Worker implementation", async () => {
  await fixture(
    { execution: "network" },
    async (graph) => {
      const result = (await graph.get())!;
      expect(result.local + result.selector).not.toContain(
        "DISTRIBUTION_PERMISSION_CANARY",
      );
      expect(
        await (
          await load(result.selector)
        ).needsRemote(new Request("https://local.invalid/")),
      ).toBe(true);
    },
    undefined,
    { kv_namespaces: [{ binding: "KV" }], assets: { directory: "public" } },
  );
});
it("manual grants dependency distribution only to selected methods and routes", async () => {
  await fixture(
    {
      execution: "manual",
      localRoutes: [
        { method: "GET", path: "/configured" },
        { method: "POST", path: "/notes" },
        { method: "GET", path: "/cloud" },
      ],
    },
    async (graph) => {
      const result = (await graph.get())!;
      expect(result.local).toContain("DISTRIBUTION_PERMISSION_CANARY");
      const { needsRemote } = await load(result.selector);
      expect(await needsRemote(new Request("https://local.invalid/"))).toBe(
        true,
      );
      expect(
        await needsRemote(new Request("https://local.invalid/configured")),
      ).toBe(false);
      expect(
        await needsRemote(new Request("https://local.invalid/missing")),
      ).toBe(true);
      expect(
        await needsRemote(
          new Request("https://local.invalid/configured", { method: "POST" }),
        ),
      ).toBe(true);
      expect(
        await needsRemote(new Request("https://local.invalid/cloud")),
      ).toBe(true);
      const request = new Request("https://local.invalid/notes", {
        method: "POST",
        body: "device note",
      });
      expect(await needsRemote(request.clone())).toBe(false);
      expect(
        await (await (await load(result.local)).default.fetch(request)).text(),
      ).toBe("device note");
    },
  );
});
it("manual does not bypass authentication middleware", async () => {
  await fixture(
    { execution: "manual", localRoutes: [{ method: "GET", path: "/private" }] },
    async (graph) => {
      const result = (await graph.get())!;
      expect(result.local).not.toContain("PROTECTED_CONTENT");
      expect(
        await (
          await load(result.selector)
        ).needsRemote(new Request("https://local.invalid/private")),
      ).toBe(true);
    },
    `import {Hono} from 'hono'; const app=new Hono(); app.use('/private',async(c,next)=>{if(c.req.header('authorization')!==c.env.SECRET)return c.text('denied',401);await next();});app.get('/private',c=>c.text('PROTECTED_CONTENT'));export default app;`,
  );
});
it("local explicitly distributes the whole Worker and supports standalone POST", async () => {
  await fixture({ execution: "local" }, async (graph) => {
    const result = (await graph.get())!;
    expect(result.local).toContain("worker.ts");
    expect(result.requiresRemote).toBe(false);
    expect(
      await (
        await load(result.selector)
      ).needsRemote(new Request("https://local.invalid/")),
    ).toBe(false);
    const response = await (
      await load(result.local)
    ).default.fetch(
      new Request("https://local.invalid/notes", {
        method: "POST",
        body: "note",
      }),
    );
    expect(await response.text()).toBe("note");
  });
});
it.each([
  { execution: "local", remoteBindings: ["SECRET"] },
  { execution: "manual", localRoutes: [{ method: "GET", path: "/typo" }] },
  { execution: "auto", localRoutes: [{ method: "GET", path: "/" }] },
  { execution: "manual" },
] as ServerBuildOptions[])(
  "rejects conflicting or unresolved configuration: %j",
  async (options) => {
    await fixture(options, async (graph) => {
      await expect(graph.get()).rejects.toThrow();
    });
  },
);

it("auto excludes Admin SDK credentials even without Cloudflare configuration", async () => {
  await fixture(
    {},
    async (graph) => {
      const result = (await graph.get())!;
      expect(result.local + result.selector).not.toContain("PRIVATE_ADMIN_KEY");
      expect(result.local + result.selector).not.toContain("firebase-admin");
      expect(
        await (
          await load(result.selector)
        ).needsRemote(new Request("https://local.invalid/")),
      ).toBe(true);
    },
    `import {Hono} from 'hono'; import {initializeApp,cert} from 'firebase-admin/app';
    const admin = initializeApp({credential:cert({privateKey:'PRIVATE_ADMIN_KEY'})});
    const app = new Hono(); app.get('/',c=>c.text('public')); export default app;`,
  );
});

it.each([false, true])(
  "an all-local auto build starts with remote configured=%s",
  async (configured) => {
    await fixture(
      {},
      async (graph) => {
        const result = (await graph.get())!;
        const selector = await load(
          (await graph.load(graph.selectorEntry))!.code,
        );
        const { createFetchRuntime } =
          await import("../../src/cloudflare/workers/worker-runtime.js");
        const runtime = createFetchRuntime({
          baseURL: "https://local.invalid/",
          prefer: "direct",
          ...(configured
            ? { remote: { origin: "https://remote.invalid" } }
            : {}),
          worker: {
            createWorker() {
              throw new Error("must stay direct");
            },
            loadDirect: async () => (await load(result.local)).default,
            needsRemote: selector.needsRemote,
            requiresRemote: selector.requiresRemote,
          },
        });
        try {
          await runtime.ready;
          expect(
            await (await runtime.fetch("https://local.invalid/")).text(),
          ).toBe("public");
        } finally {
          await runtime.dispose();
        }
      },
      `import {Hono} from 'hono'; const app=new Hono();app.get('/',c=>c.text('public'));export default app;`,
    );
  },
);
