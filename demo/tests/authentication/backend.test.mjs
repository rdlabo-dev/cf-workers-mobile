import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { startBackend, redirectUri } from "./backend.mjs";
test("test issuer rejects wrong PKCE, replay and unauthorized Worker access", async () => {
  const backend = await startBackend();
  try {
    const verifier = "v".repeat(43);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const auth = new URL("/authorize", backend.url);
    auth.search = new URLSearchParams({
      client_id: "native-test",
      redirect_uri: redirectUri,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "s".repeat(43),
    }).toString();
    const authorize = async () =>
      new URL(
        (
          await backend.dispatch(auth.href, { method: "GET", headers: {} })
        ).headers.get("location"),
      ).searchParams.get("code");
    const exchange = (code, verifier) =>
      backend.dispatch(new URL("/token", backend.url).href, {
        method: "POST",
        headers: {},
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: "native-test",
          redirect_uri: redirectUri,
          code,
          code_verifier: verifier,
        }),
      });
    assert.equal(
      (await backend.dispatch(backend.url.href, { method: "GET", headers: {} }))
        .status,
      401,
    );
    assert.equal((await exchange(await authorize(), "wrong")).status, 400);
    const code = await authorize();
    const tokenResponse = await exchange(code, verifier);
    assert.equal(tokenResponse.status, 200);
    const token = (await tokenResponse.json()).access_token;
    const sessionURL = new URL("/session", backend.url).href;
    assert.equal(
      (await backend.dispatch(sessionURL, { method: "POST", headers: {} }))
        .status,
      401,
    );
    const sessionResponse = await backend.dispatch(sessionURL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(sessionResponse.status, 204);
    const cookie = sessionResponse.headers.get("set-cookie");
    assert.match(cookie, /Secure; HttpOnly; SameSite=Lax/);
    assert.equal(
      (
        await backend.dispatch(backend.url.href, {
          method: "GET",
          headers: { cookie: cookie.split(";")[0] },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await backend.dispatch(backend.url.href, {
          method: "GET",
          headers: { cookie: "__Host-native-session=forged" },
        })
      ).status,
      401,
    );
    assert.equal((await exchange(code, verifier)).status, 400);
  } finally {
    await backend.close();
  }
});
