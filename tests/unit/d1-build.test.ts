import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { compileServerWorker, serverBindings } from "../../src/tooling/server.js";
let root: string;
beforeAll(async () => {
  await mkdir("demo/artifacts", { recursive: true });
  root = await mkdtemp(resolve("demo/artifacts/d1-compiler-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
async function compile(files: Record<string, string>) {
  for (const [name, content] of Object.entries(files))
    await writeFile(resolve(root, name), content);
  return compileServerWorker(resolve(root, "worker.ts"), ["DATABASE"]);
}
async function selector(source: string) {
  const result = await build({
    stdin: { contents: source, resolveDir: root },
    bundle: true,
    format: "esm",
    write: false,
  });
  // Dynamic data imports bypass Vite's module transform, exercising emitted JS.
  return (await import(
    /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
  )) as { needsRemote(request: Request): Promise<boolean> };
}
it("follows imported/re-exported handlers and mounted routers without route annotations", async () => {
  const result = await compile({
    "worker.ts": `import { Hono } from 'hono'; import routes from './routes'; const app = new Hono(); app.get('/', c => c.text('local UI')); app.route('/api', routes); export default app;`,
    "routes.ts": `import { Hono } from 'hono'; import { read } from './reexport'; const app = new Hono().basePath('/v1'); app.get('/items/:id', read); export default app;`,
    "reexport.ts": `export { read } from './repository';`,
    "repository.ts": `const sql = 'SELECT hidden_schema_column FROM hidden_schema_table WHERE id = ?'; export async function read(c) { return c.json(await c.env.DATABASE.prepare(sql).bind(c.req.param('id')).first()); }`,
  });
  expect(result.local).not.toMatch(/hidden_schema|prepare\(/);
  expect(result.selector).not.toMatch(/hidden_schema|prepare\(/);
  expect(result.inputs.some((file) => file.endsWith("repository.ts"))).toBe(
    true,
  );
  const { needsRemote } = await selector(result.selector);
  expect(await needsRemote(new Request("https://local.invalid/"))).toBe(false);
  expect(
    await needsRemote(new Request("https://local.invalid/api/v1/items/123")),
  ).toBe(true);
  expect(
    await needsRemote(
      new Request("https://local.invalid/api/v1/items/123", { method: "HEAD" }),
    ),
  ).toBe(true);
  expect(
    await needsRemote(new Request("https://local.invalid/api/v1/unknown")),
  ).toBe(false);
});
it("selects D1 middleware and all overlapping fallthrough candidates before execution", async () => {
  const result = await compile({
    "worker.ts": `import { Hono } from 'hono'; const app = new Hono();
    app.use('/private/*', async (c,next) => { await c.env.DATABASE.prepare('SELECT secret_middleware').first(); await next(); });
    app.get('/items/public', (c,next) => next()).get('/items/:id', c => c.json(c.env.DATABASE.prepare('SELECT secret_item')));
    app.get('/', c => c.text('local')); export default app;`,
  });
  const { needsRemote } = await selector(result.selector);
  expect(
    await needsRemote(new Request("https://local.invalid/private/missing")),
  ).toBe(true);
  expect(
    await needsRemote(new Request("https://local.invalid/items/public")),
  ).toBe(true);
  expect(await needsRemote(new Request("https://local.invalid/"))).toBe(false);
  expect(result.local).not.toMatch(/secret_middleware|secret_item/);
});
it("tracks binding assignment and shared mutable state instead of copying a server handle", async () => {
  const result = await compile({
    "worker.ts": `import { Hono } from 'hono'; const app = new Hono(); let database; let total = 0;
    app.use('/db/*', async(c,next) => { database = c.env.DATABASE; await next(); });
    app.get('/db/read', c => c.json(database.prepare('SELECT assignment_secret')));
    app.post('/write', c => { total++; return c.json(c.env.DATABASE.prepare('SELECT state_secret')); });
    app.get('/count', c => c.json(total)); app.get('/', c => c.text('local')); export default app;`,
  });
  expect(result.local).not.toMatch(/assignment_secret|state_secret/);
  const { needsRemote } = await selector(result.selector);
  expect(await needsRemote(new Request("https://local.invalid/count"))).toBe(
    true,
  );
  expect(await needsRemote(new Request("https://local.invalid/db/read"))).toBe(
    true,
  );
  expect(await needsRemote(new Request("https://local.invalid/"))).toBe(false);
});
it("expands unknown binding access to the enclosing operation and removes its implementation", async () => {
  const result = await compile({
    "worker.ts": `import { Hono } from 'hono'; const app = new Hono();
    app.get('/dynamic', c => c.json(c.env[c.req.query('binding')].prepare('SELECT dynamic_secret')));
    app.get('/', c => c.text('local')); export default app;`,
  });
  expect(result.local).not.toContain("dynamic_secret");
  const { needsRemote } = await selector(result.selector);
  expect(await needsRemote(new Request("https://local.invalid/dynamic"))).toBe(
    true,
  );
});
it("uses the whole existing Worker for unknown dispatch without distributing or executing its code", async () => {
  for (const source of [
    `export default { fetch(request,env) { return env.DATABASE.prepare('SELECT 1').first(); } };`,
    `import { Hono } from 'hono'; const app = new Hono(); app.get(process.env.PATH, c => c.text('x')); export default app;`,
    `import { Hono } from 'hono'; const app = new Hono(); console.log('startup'); export default app;`,
  ]) {
    const result = await compile({ "worker.ts": source });
    expect(result.mode).toBe("worker");
    expect(result.reason).toBeTruthy();
    expect(result.local).not.toMatch(/SELECT|Hono|console|process/);
    const { needsRemote } = await selector(result.selector);
    expect(
      await needsRemote(new Request("https://local.invalid/anything")),
    ).toBe(true);
  }
});
it("reads existing Wrangler JSONC/TOML and explicit binding settings without server secrets", async () => {
  await writeFile(
    resolve(root, "wrangler.jsonc"),
    '{ // comment\n "d1_databases": [{ "binding": "DATABASE", "database_id": "not-a-client-setting" }], }',
  );
  expect((await serverBindings(root, {})).names).toEqual(["DATABASE"]);
  await writeFile(
    resolve(root, "production.jsonc"),
    '{"env":{"production":{"d1_databases":[{"binding":"PRODUCTION_DB"}]}}}',
  );
  expect(
    (await serverBindings(root, { workerConfig: "production.jsonc" })).names,
  ).toEqual(["PRODUCTION_DB"]);
  await writeFile(
    resolve(root, "wrangler.toml"),
    '[[d1_databases]]\nbinding = "OTHER"\ndatabase_id = "server-only"',
  );
  expect(
    (await serverBindings(root, { workerConfig: "wrangler.toml" })).names,
  ).toEqual(["OTHER"]);
  expect((await serverBindings(root, { d1Bindings: ["DB"] })).names).toEqual([
    "DB",
  ]);
  await writeFile(resolve(root, "broken.jsonc"), '{"d1_databases": [');
  await expect(
    serverBindings(root, { workerConfig: "broken.jsonc" }),
  ).rejects.toThrow("Invalid Worker configuration");
});
it("keeps server environment and opaque package access remote unless a binding is explicitly local", async () => {
  const entry = resolve(root, "worker.ts");
  await writeFile(
    entry,
    `import { Hono } from 'hono'; const app = new Hono(); app.get('/secret', c => c.text(c.env.API_SECRET)); app.get('/local', c => c.text(c.env.LABEL)); export default app;`,
  );
  const result = await compileServerWorker(entry, ["DATABASE"], {
    localBindings: ["LABEL"],
  });
  expect(result.local).not.toContain("API_SECRET");
  const { needsRemote } = await selector(result.selector);
  expect(await needsRemote(new Request("https://local.invalid/secret"))).toBe(
    true,
  );
  expect(await needsRemote(new Request("https://local.invalid/local"))).toBe(
    false,
  );
  await expect(
    compileServerWorker(entry, ["DATABASE"], { localBindings: ["DATABASE"] }),
  ).rejects.toThrow("cannot also be a local binding");
});

it("keeps initializer side effects and uncertain object construction in the existing Worker", async () => {
  for (const initialize of [
    `const boot = (() => { state.value = 7; return true; })();`,
    `const boot = Object.assign(state, {value: 7});`,
    `const boot = { ...state };`,
    `class Boot { static { state.value = 7; } }`,
  ]) {
    const result = await compile({
      "worker.ts": `import { Hono } from 'hono'; const app = new Hono(); const state = {value: 0}; ${initialize}
        app.get('/', c => c.json(state.value));
        app.get('/db', c => c.json(c.env.DATABASE.prepare('SELECT initializer_secret'))); export default app;`,
    });
    expect(result.mode).toBe("worker");
    expect(result.local).not.toMatch(/initializer_secret|state|Boot/);
    const { needsRemote } = await selector(result.selector);
    expect(await needsRemote(new Request("https://local.invalid/"))).toBe(true);
  }
});

it("keeps nested router dispatch and escaped router aliases in the existing Worker", async () => {
  for (const handler of [
    `c => app.request('/db')`,
    `c => dispatch()`,
    `c => routerAlias.fetch(c.req.raw)`,
  ]) {
    const result = await compile({
      "worker.ts": `import { Hono } from 'hono'; const app = new Hono(); const routerAlias = app;
        function dispatch() { return routerAlias.request('/db'); }
        app.get('/proxy', ${handler});
        app.get('/db', c => c.text(c.env?.DATABASE?.prepare('SELECT nested_secret') ?? 'remote fallback')); export default app;`,
    });
    expect(result.mode).toBe("worker");
    expect(result.reason).toMatch(/router references/);
    expect(result.local).not.toContain("nested_secret");
    const { needsRemote } = await selector(result.selector);
    expect(await needsRemote(new Request("https://local.invalid/proxy"))).toBe(
      true,
    );
  }
});

it("keeps mutable function properties and class static state in one Worker", async () => {
  for (const declaration of [
    `function cache() {}`,
    `class cache { static total = 0; }`,
  ]) {
    const result = await compile({
      "worker.ts": `import { Hono } from 'hono'; const app = new Hono(); ${declaration}
        app.get('/count', c => c.json(cache.total ?? 0));
        app.post('/db', c => { cache.total = 7; return c.json(c.env.DATABASE.prepare('SELECT state_secret')); }); export default app;`,
    });
    expect(result.mode).toBe("worker");
    expect(result.local).not.toContain("state_secret");
    const { needsRemote } = await selector(result.selector);
    expect(await needsRemote(new Request("https://local.invalid/count"))).toBe(
      true,
    );
  }
});

it("keeps ambient global reads and writes in the existing Worker", async () => {
  for (const global of ["globalThis", "global", "self", "window"]) {
    const result = await compile({
      "worker.ts": `import { Hono } from 'hono'; const app = new Hono();
        app.post('/db', c => { ${global}.counter = 7; return c.json(c.env.DATABASE.prepare('SELECT global_secret')); });
        app.get('/count', c => c.json(${global}.counter ?? 0)); export default app;`,
    });
    expect(result.mode).toBe("worker");
    const { needsRemote } = await selector(result.selector);
    expect(await needsRemote(new Request("https://local.invalid/count"))).toBe(
      true,
    );
    expect(result.local).not.toContain("global_secret");
  }
});

it("keeps cookie login/logout/profile and D1 in a single session boundary", async () => {
  for (const [imports, handler] of [
    [
      `import { deleteCookie } from 'hono/cookie';`,
      `c => { deleteCookie(c, 'session'); return c.text('bye'); }`,
    ],
    [
      `import { getCookie } from 'hono/cookie';`,
      `c => c.text(getCookie(c, 'session') ?? '')`,
    ],
    [
      "",
      `c => { c.header('Set-Cookie', 'session=; Max-Age=0'); return c.text('bye'); }`,
    ],
    ["", `c => c.text(c.req.header('cookie') ?? '')`],
    ["", `c => c.text(c.req.raw.headers.get('COOKIE') ?? '')`],
    [
      "",
      `c => { const headers = new Headers(); headers.set(c.req.query('key'), 'session='); return new Response('', {headers}); }`,
    ],
    ["", `c => c.json(c.req.header())`],
    [
      "",
      `c => { const get = c.req.header.bind(c.req); return c.text(get(c.req.query('key'))); }`,
    ],
    [
      "",
      `c => { const get = c.req.raw.headers.get.bind(c.req.raw.headers); return c.text(get(c.req.query('key'))); }`,
    ],
    [
      "",
      `c => { const HeaderCtor = Headers; return new Response('', {headers: new HeaderCtor(JSON.parse(c.req.query('headers')))}); }`,
    ],
    ["", `c => new Response('', {headers: c.req.raw.headers})`],
    [
      "",
      `c => { const headers = c.req.raw.headers; return c.text(headers.get(c.req.query('key')) ?? ''); }`,
    ],
  ]) {
    const result = await compile({
      "worker.ts": `import { Hono } from 'hono'; ${imports} const app = new Hono();
        app.get('/session', ${handler});
        app.get('/db', c => c.json(c.env.DATABASE.prepare('SELECT cookie_secret'))); export default app;`,
    });
    expect(result.mode).toBe("worker");
    expect(result.reason).toMatch(/cookie|Cookie|session/i);
    const { needsRemote } = await selector(result.selector);
    expect(
      await needsRemote(new Request("https://local.invalid/session")),
    ).toBe(true);
    expect(result.local).not.toContain("cookie_secret");
  }
});

it("preserves local routes with statically named non-cookie headers", async () => {
  const result = await compile({
    "worker.ts": `import { Hono } from 'hono'; const app = new Hono();
      app.get('/health', c => { c.header('x-worker', 'local'); return new Response(c.req.raw.headers.get('accept'), {headers: {'content-type': 'text/plain'}}); });
      app.get('/db', c => c.json(c.env.DATABASE.prepare('SELECT header_secret'))); export default app;`,
  });
  expect(result.mode).toBe("routes");
  const { needsRemote } = await selector(result.selector);
  expect(await needsRemote(new Request("https://local.invalid/health"))).toBe(
    false,
  );
});
