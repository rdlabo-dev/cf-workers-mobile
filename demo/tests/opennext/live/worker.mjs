// Test-only deployment wrapper. The OpenNext application's source is unchanged.
import app from "../../../opennext/.open-next/worker.js";
import driver from "../native-driver.js?text";
import imageDriver from "../images-driver.js?text";
import plugin from "../../../artifacts/opennext-live/plugin.js?text";
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const admin =
      request.headers.get("authorization") === `Bearer ${env.ADMIN_TOKEN}`;
    if (
      !admin &&
      request.headers.get("authorization") !== `Bearer ${env.DEVICE_TOKEN}`
    )
      return new Response("Unauthorized", { status: 401 });
    if (url.pathname === "/__acceptance/control") {
      if (!admin) return new Response("Forbidden", { status: 403 });
      if (request.method === "POST") {
        const config = await request.json();
        if (!["flow", "restart", "logout", "loggedout"].includes(config.mode))
          return new Response("Invalid mode", { status: 400 });
        if (config.mode === "flow") {
          await env.DB.batch([
            env.DB.prepare("DELETE FROM sessions"),
            env.DB.prepare("UPDATE notes SET value = 'First note', writes = 0"),
            env.DB.prepare("DELETE FROM acceptance_reports"),
          ]);
        }
        await env.DB.prepare(
          "INSERT OR REPLACE INTO acceptance_config VALUES (1, ?)",
        )
          .bind(JSON.stringify(config))
          .run();
      }
      const rows = await env.DB.prepare(
        "SELECT body FROM acceptance_reports ORDER BY id",
      ).all();
      const sessions = await env.DB.prepare(
        "SELECT count(*) AS count FROM sessions",
      ).first();
      return Response.json({
        reports: rows.results.map((r) => JSON.parse(r.body)),
        sessionCount: sessions.count,
      });
    }
    if (url.pathname === "/__acceptance/config") {
      const config = await env.DB.prepare(
        "SELECT body FROM acceptance_config WHERE id = 1",
      ).first();
      return new Response(config.body, {
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      });
    }
    if (url.pathname === "/__acceptance/report" && request.method === "POST") {
      const report = await request.json();
      report.notes = await env.DB.prepare("SELECT * FROM notes").all();
      await env.DB.prepare("INSERT INTO acceptance_reports (body) VALUES (?)")
        .bind(JSON.stringify(report))
        .run();
      return new Response("ok");
    }
    if (
      ["/__acceptance/driver.js", "/__acceptance/plugin.js"].includes(
        url.pathname,
      )
    )
      return new Response(
        url.pathname.endsWith("plugin.js")
          ? plugin
          : url.searchParams.has("images")
            ? imageDriver
            : driver,
        { headers: { "content-type": "text/javascript" } },
      );
    if (request.method === "GET" || request.method === "HEAD") {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) return asset;
    }
    const response = await app.fetch(request, env, ctx);
    if (!response.headers.get("content-type")?.includes("text/html"))
      return response;
    return new HTMLRewriter()
      .on("body", {
        element(body) {
          body.append(
            `<script src="/__acceptance/plugin.js"></script><script src="/__acceptance/driver.js${url.pathname === "/images" ? "?images" : ""}"></script>`,
            { html: true },
          );
        },
      })
      .transform(response);
  },
};
