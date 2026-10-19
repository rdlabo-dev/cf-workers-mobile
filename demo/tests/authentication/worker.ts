export default {
  fetch(
    request: Request,
    env: { SESSION_TOKEN: string; COOKIE_SESSION: string },
  ) {
    if (
      new URL(request.url).pathname === "/session" &&
      request.method === "POST"
    ) {
      if (
        request.headers.get("authorization") !== `Bearer ${env.SESSION_TOKEN}`
      )
        return new Response("Unauthorized", { status: 401 });
      return new Response(null, {
        status: 204,
        headers: {
          "set-cookie": `__Host-native-session=${env.COOKIE_SESSION}; Path=/; Secure; HttpOnly; SameSite=Lax`,
          "cache-control": "no-store",
        },
      });
    }
    if (
      !(request.headers.get("cookie") ?? "")
        .split(/;\s*/)
        .includes(`__Host-native-session=${env.COOKIE_SESSION}`)
    )
      return new Response("Unauthorized", { status: 401 });
    return new Response(
      '<!doctype html><html><head><meta charset="utf-8"></head><body><h1>Authenticated Worker</h1></body></html>',
      { headers: { "content-type": "text/html", "cache-control": "no-store" } },
    );
  },
};
