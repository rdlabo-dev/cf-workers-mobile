import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { fileURLToPath } from "node:url";

test("public test issuer rejects unauthorized control, wrong PKCE and code replay", async () => {
  const compiled = await build({
    entryPoints: [fileURLToPath(new URL("worker.mjs", import.meta.url))],
    bundle: true,
    format: "esm",
    write: false,
  });
  const worker = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: compiled.outputFiles[0].text,
      compatibilityDate: "2026-10-17",
      d1Databases: ["DB"],
      bindings: {
        ADMIN_TOKEN: "admin-test-only",
        TEST_CLIENT_ID: "client-test-only",
        SESSION_TOKEN: "access-test-only",
        COOKIE_SESSION: "cookie-test-only",
      },
    }),
  );
  try {
    const db = await worker.getD1Database("DB");
    await db.exec(
      "CREATE TABLE oauth_codes (code TEXT PRIMARY KEY, challenge TEXT NOT NULL, expires INTEGER NOT NULL); CREATE TABLE oauth_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL); CREATE TABLE oauth_evidence (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL);",
    );
    const fetch = (path, init) =>
      worker.dispatchFetch("https://issuer.test" + path, init);
    assert.equal(
      (await fetch("/__acceptance/control", { method: "POST" })).status,
      401,
    );
    assert.equal((await fetch("/")).status, 401);
    assert.equal((await fetch("/authorize?client_id=unknown")).status, 400);
    const verifier = randomBytes(32).toString("base64url");
    const params = {
      client_id: "client-test-only",
      redirect_uri:
        "jp.rdlabo.workerscapacitor.authentication://oauth/callback",
      response_type: "code",
      code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      state: randomBytes(32).toString("base64url"),
    };
    const authorize = async (overrides = {}) =>
      fetch("/authorize?" + new URLSearchParams({ ...params, ...overrides }), {
        redirect: "manual",
      });
    assert.equal(
      (await authorize({ redirect_uri: "evil://callback" })).status,
      400,
    );
    const getCode = async () =>
      new URL((await authorize()).headers.get("location")).searchParams.get(
        "code",
      );
    const exchange = (code, code_verifier) =>
      fetch("/token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: params.client_id,
          redirect_uri: params.redirect_uri,
          grant_type: "authorization_code",
          code,
          code_verifier,
        }),
      });
    const wrong = await getCode();
    assert.equal((await exchange(wrong, "wrong")).status, 400);
    assert.equal((await exchange(wrong, verifier)).status, 400);
    const code = await getCode();
    assert.equal((await exchange(code, verifier)).status, 200);
    assert.equal((await exchange(code, verifier)).status, 400);
    const expired = await getCode();
    await db
      .prepare("UPDATE oauth_codes SET expires = 0 WHERE code = ?")
      .bind(expired)
      .run();
    assert.equal((await exchange(expired, verifier)).status, 400);
    const session = await fetch("/session", {
      method: "POST",
      headers: { authorization: "Bearer access-test-only" },
    });
    assert.equal(session.status, 204);
    const cookie = session.headers.get("set-cookie");
    assert.match(cookie, /Secure; HttpOnly/);
    assert.equal(
      (await fetch("/", { headers: { cookie: cookie.split(";")[0] } })).status,
      200,
    );
  } finally {
    await worker.dispose();
  }
});
