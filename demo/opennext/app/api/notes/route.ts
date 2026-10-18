import { validCsrf } from "../../csrf";
import { db, owner } from "../../db";
export async function POST(request: Request) {
  const form = await request.formData();
  if (!(await validCsrf(form)))
    return new Response("Forbidden", { status: 403 });
  const user = await owner();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const value = form.get("value");
  if (typeof value !== "string" || !value || value.length > 100)
    return new Response("Invalid note", { status: 400 });
  await db()
    .prepare("UPDATE notes SET value = ?, writes = writes + 1 WHERE owner = ?")
    .bind(value, user)
    .run();
  return new Response(null, { status: 303, headers: { location: "/account" } });
}
