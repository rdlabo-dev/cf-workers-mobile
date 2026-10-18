import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies } from "next/headers";
export function db() {
  return (getCloudflareContext().env as unknown as { DB: D1Database }).DB;
}
export async function owner() {
  const token = (await cookies()).get("demo_session")?.value;
  if (!token) return null;
  return (
    (
      await db()
        .prepare("SELECT owner FROM sessions WHERE token = ? AND expires > ?")
        .bind(token, Date.now())
        .first<{ owner: string }>()
    )?.owner ?? null
  );
}
