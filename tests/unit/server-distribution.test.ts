import { it, expect } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { compileServerWorker } from "../../src/tooling/server.js";
const secret = "PRIVATE_CANARY_4ef927a";
const cases: readonly (readonly [string, string, string?])[] = [
  [
    "import-service-account",
    `import account from './service-account.json'; app.get('/target', c => c.text(account.project_id));`,
  ],
  [
    "require-service-account",
    `const account = require('./service-account.json'); app.get('/target', c => c.text(account.project_id));`,
  ],
  [
    "import-credentials-module",
    `import {account} from './credentials'; app.get('/target', c => c.text(account.project_id));`,
  ],
  [
    "reexport-credentials-module",
    `import {account} from './credentials-barrel'; app.get('/target', c => c.text(account.project_id));`,
  ],
  [
    "require-credentials-module",
    `const account = require('./credentials.cjs'); app.get('/target', c => c.text(account.project_id));`,
  ],
  [
    "dynamic-import-credentials",
    `app.get('/target', async c => c.text((await import('./service-account.json')).default.project_id));`,
  ],
  [
    "firebase-admin-initialization",
    `import {verify} from './firebase-auth'; app.get('/target', async c => c.json(await verify(c.req.header('authorization'))));`,
  ],
  [
    "firebase-admin-auth-guard",
    `import {verify} from './firebase-auth'; app.use('/target',async(c,next)=>{await verify(c.req.header('authorization'));await next();}); app.get('/target', c => c.text('protected'));`,
  ],
  [
    "firebase-admin-require",
    `const {initializeApp,cert} = require('firebase-admin/app'); const account = require('./service-account.json'); const admin = initializeApp({credential:cert(account)}); app.get('/target', c => c.json(admin));`,
  ],
  ["env-secret", `app.get('/target', c => c.text(c.env.API_SECRET));`],
  [
    "cloudflare-env",
    `import { env } from 'cloudflare:workers'; app.get('/target', c => c.text(env.API_SECRET));`,
  ],
  ["process-env", `app.get('/target', c => c.text(process.env.API_SECRET));`],
  [
    "execution-context",
    `app.get('/target', c => c.text(c.executionCtx.props.API_SECRET));`,
  ],
  [
    "sql-import-reexport",
    `import { query } from './reexport'; app.get('/target', query);`,
  ],
  [
    "opaque-auth-package",
    `import { basicAuth } from 'hono/basic-auth'; app.use('/target', basicAuth({username:'admin', password:'${secret}'})); app.get('/target', c => c.text('private'));`,
  ],
  [
    "shared-session-cache",
    `let user; app.post('/login', c => { user = c.env.API_SECRET; return c.text('ok'); }); app.get('/target', c => c.text(user));`,
  ],
  [
    "remote-error-handler",
    `app.onError((err,c) => c.text(c.env.API_SECRET)); app.get('/target', c => c.text('public'));`,
  ],
  [
    "remote-not-found",
    `app.notFound(c => c.text(c.env.API_SECRET)); app.get('/target', c => c.text('public'));`,
  ],
  [
    "mounted-remote-auth",
    `const child = new Hono(); child.get('/target', c => c.text('${secret}')); app.use('/private/*', async(c,next) => { if(c.req.header('authorization') !== c.env.API_SECRET) return c.text('denied',401); await next(); }); app.route('/private', child);`,
    "/private/target",
  ],
  [
    "shared-object-with-remote-owner",
    `const config = {title:'public', privateKey:'${secret}'}; app.get('/target', c => c.text(config.title)); app.get('/sign', c => c.text(c.env.SIGNER.sign(config.privateKey)));`,
  ],
  [
    "dynamic-import",
    `app.get('/target', async c => c.json(await (await import('./repository')).query(c)));`,
  ],
  [
    "auth-and-handler-same-registration",
    `app.get('/target', async(c,next) => { if(c.req.header('authorization') !== c.env.API_SECRET) return c.text('denied',401); await next(); }, c => c.text('${secret}'));`,
  ],
  [
    "global-remote-auth",
    `app.use('*', async(c,next) => { if(c.req.header('authorization') !== c.env.API_SECRET) return c.text('denied',401); await next(); }); app.get('/target', c => c.text('${secret}'));`,
  ],
  [
    "auth-in-separate-registration",
    `app.get('/target', async(c,next) => { if(c.req.header('authorization') !== c.env.API_SECRET) return c.text('denied',401); await next(); }); app.get('/target', c => c.text('${secret}'));`,
  ],
  ["public-control", `app.get('/target', c => c.html('<h1>public</h1>'));`],
  [
    "nested-route-under-root-guard",
    `const child = new Hono(); child.get('/', c => c.text('${secret}')); app.get('/target', c => c.text(c.env.API_SECRET)); app.route('/target',child);`,
  ],
  [
    "remote-wildcard-overlap",
    `app.get('/target/*', c => c.text(c.env.API_SECRET)); app.get('/target/data', c => c.text('${secret}'));`,
    "/target/data",
  ],
  [
    "named-public-passthrough",
    `async function headers(c,next){await next();} app.use('*',headers); app.get('/target',c=>c.text('public'));`,
  ],
];
it.each(cases)(
  "does not distribute private data: %s",
  async (name, body, path = "/target") => {
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
      const account = JSON.stringify({
        type: "service_account",
        project_id: "public-project",
        private_key_id: "synthetic-key-id",
        private_key: `-----BEGIN PRIVATE KEY-----\n${secret}\n-----END PRIVATE KEY-----`,
        client_email: "synthetic@example.invalid",
      });
      await writeFile(resolve(root, "service-account.json"), account);
      await writeFile(
        resolve(root, "credentials.ts"),
        `export const account = ${account};`,
      );
      await writeFile(
        resolve(root, "credentials-barrel.ts"),
        "export { account } from './credentials';",
      );
      await writeFile(
        resolve(root, "credentials.cjs"),
        `module.exports = ${account};`,
      );
      await writeFile(
        resolve(root, "firebase-auth.ts"),
        `
        import { initializeApp, cert } from 'firebase-admin/app';
        import { getAuth } from 'firebase-admin/auth';
        import account from './service-account.json';
        const admin = initializeApp({credential: cert(account)});
        export function verify(token) { return getAuth(admin).verifyIdToken(token); }
      `,
      );
      const result = await compileServerWorker(
        resolve(root, "worker.ts"),
        ["DATABASE"],
        { execution: [{ method: "GET", path: "/public" }] },
      );
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
      const local = await bundle(result.local);
      const selected = await bundle(result.selector);
      for (const file of [...local, ...selected]) {
        expect(file.text).not.toContain(secret);
        expect(file.text).not.toContain(Buffer.from(secret).toString("base64"));
      }
      const module = await import(
        /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(selected.find((f) => f.path.endsWith(".js"))!.text).toString("base64")}`
      );
      expect(
        await module.needsRemote(new Request(`https://local.invalid${path}`)),
      ).toBe(true);
      if (name === "public-control") {
        expect(
          await module.needsRemote(new Request("https://local.invalid/public")),
        ).toBe(false);
        const { default: worker } = await import(
          /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(local.find((f) => f.path.endsWith(".js"))!.text).toString("base64")}`
        );
        expect(
          await (
            await worker.fetch(new Request("https://local.invalid/public"))
          ).text(),
        ).toBe("public");
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
