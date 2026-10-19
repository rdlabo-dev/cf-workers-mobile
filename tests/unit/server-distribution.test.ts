import { it, expect } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { compileServerWorker } from "../../src/tooling/server.js";
const secret = "PRIVATE_CANARY_4ef927a";
const cases: readonly (readonly [string, string, boolean, string?, string?])[] =
  [
    [
      "response-object-coercion",
      `app.get('/target', c => c.text(String(new Response('${secret}'))));`,
      true,
      "/target",
      "[object Response]",
    ],
    [
      "response-object-json",
      `app.get('/target', c => c.json({response: new Response('${secret}')}));`,
      true,
      "/target",
      '{"response":{}}',
    ],
    [
      "nested-response-body",
      `app.get('/target', c => new Response(String(new Response('${secret}'))));`,
      true,
      "/target",
      "[object Response]",
    ],
    [
      "private-projection-response-baseline",
      `const settings = {title:'My App', apiSecret:'${secret}'}; app.get('/target', c => c.text(settings.title));`,
      true,
      "/target",
      "My App",
    ],
    ["env-secret", `app.get('/target', c => c.text(c.env.API_SECRET));`, true],
    [
      "env-alias",
      `app.get('/target', c => { const e = c.env; return c.text(e.API_SECRET); });`,
      true,
    ],
    [
      "env-destructure",
      `app.get('/target', ({env}) => new Response(env.API_SECRET));`,
      true,
    ],
    [
      "env-computed",
      `app.get('/target', c => c.text(c.env[c.req.query('key')]));`,
      true,
    ],
    [
      "cloudflare-env",
      `import { env } from 'cloudflare:workers'; app.get('/target', c => c.text(env.API_SECRET));`,
      true,
    ],
    [
      "process-env",
      `app.get('/target', c => c.text(process.env.API_SECRET));`,
      true,
    ],
    [
      "execution-context",
      `app.get('/target', c => c.text(c.executionCtx.props.API_SECRET));`,
      true,
    ],
    [
      "sql-remote-handler",
      `app.get('/target', c => c.json(c.env.DATABASE.prepare('${secret}')));`,
      true,
    ],
    [
      "sql-import-reexport",
      `import { query } from './reexport'; app.get('/target', query);`,
      true,
    ],
    [
      "private-key-remote-only",
      `const signingKey = '${secret}'; app.get('/target', c => c.text(c.env.SIGNER.sign(signingKey)));`,
      true,
    ],
    [
      "remote-fetch-credentials",
      `app.get('/target', async c => c.text(await (await fetch('https://internal.invalid', {headers: {authorization:'${secret}'}})).text()));`,
      true,
    ],
    [
      "opaque-auth-package",
      `import { basicAuth } from 'hono/basic-auth'; app.use('/target', basicAuth({username:'admin', password:'${secret}'})); app.get('/target', c => c.text('private'));`,
      true,
    ],
    [
      "cookie-session",
      `app.get('/target', c => c.text(c.req.header('cookie')));`,
      true,
    ],
    [
      "shared-session-cache",
      `let user; app.post('/login', c => { user = c.env.API_SECRET; return c.text('ok'); }); app.get('/target', c => c.text(user));`,
      true,
    ],
    [
      "remote-error-handler",
      `app.onError((err,c) => c.text(c.env.API_SECRET)); app.get('/target', c => c.text('public'));`,
      true,
    ],
    [
      "remote-not-found",
      `app.notFound(c => c.text(c.env.API_SECRET)); app.get('/target', c => c.text('public'));`,
      true,
    ],
    [
      "remote-auth-protected-html",
      `app.use('/target', async(c,next) => { if(c.req.header('authorization') !== c.env.API_SECRET) return c.text('denied',401); await next(); }); app.get('/target', c => c.html('<h1>${secret}</h1>'));`,
      true,
    ],
    [
      "remote-auth-protected-json",
      `const customers = [{email:'${secret}'}]; app.use('/target', async(c,next) => { if(c.req.header('authorization') !== c.env.API_SECRET) return c.text('denied',401); await next(); }); app.get('/target', c => c.json(customers));`,
      true,
    ],
    [
      "mounted-remote-auth",
      `const child = new Hono(); child.get('/target', c => c.text('${secret}')); app.use('/private/*', async(c,next) => { if(c.req.header('authorization') !== c.env.API_SECRET) return c.text('denied',401); await next(); }); app.route('/private', child);`,
      true,
      "/private/target",
    ],
    [
      "inline-auth-secret",
      `app.get('/target', c => c.req.header('authorization') === '${secret}' ? c.text('yes') : c.text('no',401));`,
      true,
    ],
    [
      "private-object-sibling",
      `const config = {title:'public', privateKey:'${secret}'}; app.get('/target', c => c.text(config.title));`,
      true,
    ],
    [
      "private-json-sibling",
      `import config from './settings.json'; app.get('/target', c => c.text(config.title));`,
      true,
    ],
    [
      "private-helper-branch",
      `function format(kind) { if(kind === 'private') return '${secret}'; return 'public'; } app.get('/target', c => c.text(format('public')));`,
      true,
    ],
    [
      "private-unused-parameter-default",
      `function format(value = '${secret}') { return value; } app.get('/target', c => c.text(format('public')));`,
      true,
    ],
    [
      "shared-object-with-remote-owner",
      `const config = {title:'public', privateKey:'${secret}'}; app.get('/target', c => c.text(config.title)); app.get('/sign', c => c.text(c.env.SIGNER.sign(config.privateKey)));`,
      true,
    ],
    [
      "unused-private-constant",
      `const privateKey = '${secret}'; app.get('/target', c => c.text('public'));`,
      false,
    ],
    [
      "env-optional-chain",
      `app.get('/target', c => c.text(c.env?.API_SECRET));`,
      true,
    ],
    [
      "env-helper-argument",
      `function read(env) { return env.API_SECRET; } app.get('/target', c => c.text(read(c.env)));`,
      true,
    ],
    [
      "env-context-alias",
      `app.get('/target', context => { const c = context; return c.text(c.env.API_SECRET); });`,
      true,
    ],
    [
      "env-helper-return",
      `function read(c) { return c.env; } app.get('/target', c => c.text(read(c).API_SECRET));`,
      true,
    ],
    ["env-spread", `app.get('/target', c => c.json({...c.env}));`, true],
    [
      "opaque-crypto",
      `import {createHmac} from 'node:crypto'; app.get('/target', c => c.text(createHmac('sha256','${secret}').update('public').digest('hex')));`,
      true,
    ],
    [
      "dynamic-import",
      `app.get('/target', async c => c.json(await (await import('./repository')).query(c)));`,
      true,
    ],
    [
      "auth-and-handler-same-registration",
      `app.get('/target', async(c,next) => { if(c.req.header('authorization') !== c.env.API_SECRET) return c.text('denied',401); await next(); }, c => c.text('${secret}'));`,
      true,
    ],
    [
      "global-remote-auth",
      `app.use('*', async(c,next) => { if(c.req.header('authorization') !== c.env.API_SECRET) return c.text('denied',401); await next(); }); app.get('/target', c => c.text('${secret}'));`,
      true,
    ],
    [
      "auth-in-separate-registration",
      `app.get('/target', async(c,next) => { if(c.req.header('authorization') !== c.env.API_SECRET) return c.text('denied',401); await next(); }); app.get('/target', c => c.text('${secret}'));`,
      true,
    ],
    [
      "role-check-static-data",
      `app.use('/target', async(c,next) => { c.set('role', await c.env.DATABASE.prepare('SELECT role').first()); await next(); }); app.get('/target', c => c.get('role') === 'admin' ? c.json({data:'${secret}'}) : c.text('denied',403));`,
      true,
    ],
    [
      "closure-private-default",
      `const render = (value = '${secret}') => value; app.get('/target', c => c.text(render('public')));`,
      true,
    ],
    [
      "encoded-private-data",
      `const config = {title:'public', key:'${Buffer.from(secret).toString("base64")}'}; app.get('/target', c => c.text(config.title));`,
      true,
    ],
    [
      "public-control",
      `app.get('/target', c => c.html('<h1>public</h1>'));`,
      false,
    ],
    [
      "inline-object-projection",
      `app.get('/target', c => c.text(({title:'public', key:'${secret}'}).title));`,
      true,
    ],
    [
      "ignored-helper-argument",
      `function view(ignored) { return 'public'; } app.get('/target', c => c.text(view('${secret}')));`,
      true,
    ],
    [
      "ignored-arrow-argument",
      `const view = ignored => 'public'; app.get('/target', c => c.text(view('${secret}')));`,
      true,
    ],
    [
      "discarded-response-option",
      `app.get('/target', c => new Response('public', {unused:'${secret}'}));`,
      true,
    ],
    [
      "discarded-response-argument",
      `app.get('/target', c => new Response('public', {}, '${secret}'));`,
      true,
    ],
    [
      "discarded-hono-argument",
      `app.get('/target', c => c.text('public', 200, {}, '${secret}'));`,
      true,
    ],
    [
      "discarded-json-property",
      `app.get('/target', c => c.json({label:'${secret}', label:'public'}));`,
      true,
    ],
    [
      "prototype-json-property",
      `app.get('/target', c => c.json({__proto__:{key:'${secret}'}, label:'public'}));`,
      true,
    ],
    [
      "object-coercion",
      `app.get('/target', c => c.text(String({key:'${secret}'})));`,
      true,
    ],
    [
      "template-object-coercion",
      `app.get('/target', c => c.text(\`value: \${{key:'${secret}'}}\`));`,
      true,
    ],
    [
      "bodyless-status",
      `app.get('/target', c => c.text('${secret}',204));`,
      true,
    ],
    [
      "bodyless-response",
      `app.get('/target', c => new Response('${secret}',{status:204}));`,
      true,
    ],
    [
      "unrelated-property-name",
      `const customer = {key:'${secret}'}; app.get('/target', c => c.json({customer:'public'}));`,
      false,
    ],
    [
      "nested-route-under-root-guard",
      `const child = new Hono(); child.get('/', c => c.text('${secret}')); app.get('/target', c => c.text(c.env.API_SECRET)); app.route('/target',child);`,
      true,
    ],
    [
      "remote-wildcard-overlap",
      `app.get('/target/*', c => c.text(c.env.API_SECRET)); app.get('/target/data', c => c.text('${secret}'));`,
      true,
      "/target/data",
    ],
    [
      "remote-optional-overlap",
      `app.get('/target/:id?', c => c.text(c.env.API_SECRET)); app.get('/target', c => c.text('${secret}'));`,
      true,
    ],
    [
      "head-get-overlap",
      `app.on('HEAD', '/target', c => c.text(c.env.API_SECRET)); app.get('/target', c => c.text('${secret}'));`,
      true,
    ],
    [
      "trailing-slash-overlap",
      `app.get('/target/', c => c.text(c.env.API_SECRET)); app.get('/target', c => c.text('${secret}'));`,
      true,
    ],
    [
      "terminating-local-middleware",
      `app.use('/target', c => c.text('denied',401)); app.get('/target', c => c.text('${secret}'));`,
      true,
    ],
    [
      "unreachable-local-registration",
      `app.get('/target', c => c.text('denied',401)); app.get('/target', c => c.text('${secret}'));`,
      true,
    ],
    ["invalid-raw-return", `app.get('/target', c => '${secret}');`, true],
    [
      "protected-response-header-middleware",
      `app.use('/target', async(c,next) => { if(c.req.header('authorization') !== c.env.API_SECRET) return c.text('denied',401); await next(); }); app.use('/target',async(c,next)=>{await next();c.header('x-private','${secret}');}); app.get('/target',c=>c.text('public'));`,
      true,
    ],
    [
      "protected-later-header-middleware",
      `app.get('/target',c=>c.text(c.env.API_SECRET)); app.use('/target',async(c,next)=>{await next();c.header('x-private','${secret}');});`,
      true,
    ],
    [
      "shadowed-template-tag",
      `import {html} from 'hono/html'; function view(html){ return html\`<p>${secret}</p>\`; } app.get('/target',c=>c.html(view('public')));`,
      true,
    ],
    [
      "application-response-constructor",
      `function Response(ignored){ return 'public'; } app.get('/target',c=>new Response('${secret}'));`,
      true,
    ],
    [
      "named-public-passthrough",
      `async function headers(c,next){await next();c.header('x-public','yes');} app.use('*',headers); app.get('/target',c=>c.text('public'));`,
      false,
    ],
  ];
it.each(cases)(
  "does not distribute private data: %s",
  async (_name, body, expectedRemote, path = "/target", expectedBody) => {
    await mkdir("demo/artifacts", { recursive: true });
    const root = await mkdtemp(resolve("demo/artifacts/distribution-"));
    try {
      await writeFile(
        resolve(root, "worker.ts"),
        `import { Hono } from 'hono'; const app = new Hono(); ${body}
app.get('/public', c => c.text('public')); app.get('/db', c => c.json(c.env.DATABASE)); export default app;`,
      );
      await writeFile(
        resolve(root, "repository.ts"),
        `export function query(c) { return c.json(c.env.DATABASE.prepare('${secret}')); }`,
      );
      await writeFile(
        resolve(root, "reexport.ts"),
        `export {query} from './repository';`,
      );
      await writeFile(
        resolve(root, "settings.json"),
        JSON.stringify({ title: "public", privateKey: secret }),
      );
      const result = await compileServerWorker(resolve(root, "worker.ts"), [
        "DATABASE",
      ]);
      const bundle = async (contents: string) =>
        (
          await build({
            stdin: { contents, resolveDir: root },
            bundle: true,
            format: "esm",
            write: false,
            minify: true,
            sourcemap: "external",
            outfile: "client.js",
          })
        ).outputFiles;
      if (expectedBody !== undefined) {
        const original = await build({
          entryPoints: [resolve(root, "worker.ts")],
          bundle: true,
          format: "esm",
          write: false,
        });
        const { default: worker } = await import(
          /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(original.outputFiles[0]!.text).toString("base64")}`
        );
        const response = await worker.fetch(
          new Request(`https://local.invalid${path}`),
        );
        expect(response.status).toBe(200);
        expect(await response.text()).toBe(expectedBody);
        expect(JSON.stringify([...response.headers])).not.toContain(secret);
      }
      const local = await bundle(result.local);
      const selected = await bundle(result.selector);
      if (!expectedRemote && expectedBody !== undefined) {
        const { default: worker } = await import(
          /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(local.find((file) => file.path.endsWith(".js"))!.text).toString("base64")}`
        );
        const response = await worker.fetch(
          new Request(`https://local.invalid${path}`),
        );
        expect(response.status).toBe(200);
        expect(await response.text()).toBe(expectedBody);
      }
      for (const file of [...local, ...selected]) {
        expect(file.text).not.toContain(secret);
        expect(file.text).not.toContain(Buffer.from(secret).toString("base64"));
      }
      const module = await import(
        /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(selected.find((f) => f.path.endsWith(".js"))!.text).toString("base64")}`
      );
      expect(
        await module.needsRemote(new Request(`https://local.invalid${path}`)),
      ).toBe(expectedRemote);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
