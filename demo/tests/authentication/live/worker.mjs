// Synthetic OAuth issuer for public-HTTPS device tests; never a production IdP.
import app from "../worker.ts";
const redirectUri =
  "jp.rdlabo.workerscapacitor.authentication://oauth/callback";
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const evidence = (stage) =>
      env.DB.prepare("INSERT INTO oauth_evidence (body) VALUES (?)")
        .bind(JSON.stringify({ stage }))
        .run();
    if (url.pathname === "/__acceptance/control") {
      if (request.headers.get("authorization") !== `Bearer ${env.ADMIN_TOKEN}`)
        return new Response("Unauthorized", { status: 401 });
      if (request.method === "POST")
        await env.DB.batch([
          env.DB.prepare("DELETE FROM oauth_codes"),
          env.DB.prepare("DELETE FROM oauth_reports"),
          env.DB.prepare("DELETE FROM oauth_evidence"),
        ]);
      const read = async (table) =>
        (
          await env.DB.prepare(`SELECT body FROM ${table} ORDER BY id`).all()
        ).results.map((r) => JSON.parse(r.body));
      return Response.json({
        reports: await read("oauth_reports"),
        evidence: await read("oauth_evidence"),
      });
    }
    if (url.pathname === "/authorize") {
      const p = url.searchParams;
      if (
        p.get("client_id") !== env.TEST_CLIENT_ID ||
        p.get("redirect_uri") !== redirectUri ||
        p.get("response_type") !== "code" ||
        p.get("code_challenge_method") !== "S256" ||
        !/^[\w-]{43}$/.test(p.get("code_challenge") ?? "") ||
        !/^[\w-]{43}$/.test(p.get("state") ?? "")
      )
        return new Response("Invalid OAuth request", { status: 400 });
      await evidence("system-browser");
      const code = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO oauth_codes VALUES (?, ?, ?)")
        .bind(code, p.get("code_challenge"), Date.now() + 60000)
        .run();
      const redirect = new URL(redirectUri);
      redirect.searchParams.set("code", code);
      redirect.searchParams.set("state", p.get("state"));
      await evidence("authorization-code");
      return new Response(null, {
        status: 302,
        headers: { location: redirect.href, "cache-control": "no-store" },
      });
    }
    if (url.pathname === "/token" && request.method === "POST") {
      const p = new URLSearchParams(await request.text());
      if (
        p.get("client_id") !== env.TEST_CLIENT_ID ||
        p.get("redirect_uri") !== redirectUri ||
        p.get("grant_type") !== "authorization_code"
      )
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      const code = await env.DB.prepare(
        "DELETE FROM oauth_codes WHERE code = ? RETURNING challenge, expires",
      )
        .bind(p.get("code"))
        .first();
      const bytes = new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(p.get("code_verifier") ?? ""),
        ),
      );
      const challenge = btoa(String.fromCharCode(...bytes))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
      if (!code || code.expires < Date.now() || code.challenge !== challenge)
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      await evidence("pkce-exchange");
      return Response.json(
        {
          access_token: env.SESSION_TOKEN,
          token_type: "Bearer",
          expires_in: 300,
        },
        { headers: { "cache-control": "no-store" } },
      );
    }
    const response = app.fetch(request, env);
    if (url.pathname === "/session" && response.status === 204)
      await evidence("session-created");
    if (response.status !== 200) return response;
    if (url.pathname === "/__acceptance/report" && request.method === "POST") {
      await env.DB.prepare("INSERT INTO oauth_reports (body) VALUES (?)")
        .bind(JSON.stringify(await request.json()))
        .run();
      return new Response("ok");
    }
    await evidence("authenticated-request");
    return new HTMLRewriter()
      .on("body", {
        element(body) {
          body.append(
            `<script>fetch('/__acceptance/report',{method:'POST',body:JSON.stringify({stage:'complete',platform:window.Capacitor?.getPlatform?.(),text:document.querySelector('h1')?.textContent})})</script>`,
            { html: true },
          );
        },
      })
      .transform(response);
  },
};
