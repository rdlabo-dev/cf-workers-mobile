import { validCsrf } from "../../csrf";
import { cookies } from "next/headers";
import { db } from "../../db";
export async function POST(request: Request) {
  const form = await request.formData();
  if (!(await validCsrf(form)))
    return new Response("Forbidden", { status: 403 });
  if (form.get("logout")) {
    const token = (await cookies()).get("demo_session")?.value;
    if (token)
      await db()
        .prepare("DELETE FROM sessions WHERE token = ?")
        .bind(token)
        .run();
    return new Response(null, {
      status: 303,
      headers: {
        location: "/account",
        "set-cookie":
          "demo_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
      },
    });
  }
  if (form.get("user") !== "alice" || form.get("password") !== "demo")
    return new Response("Unauthorized", { status: 401 });
  const token = crypto.randomUUID();
  await db()
    .prepare("INSERT INTO sessions VALUES (?, ?, ?)")
    .bind(token, "alice", Date.now() + 3600000)
    .run();
  return new Response(null, {
    status: 303,
    headers: {
      location: "/account",
      "set-cookie": `demo_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`,
    },
  });
}
