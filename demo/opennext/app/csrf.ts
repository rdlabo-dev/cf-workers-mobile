import { cookies } from "next/headers";
export async function csrfToken() {
  return (await cookies()).get("__Host-demo_csrf")?.value || "";
}
export async function validCsrf(form: FormData) {
  const token = await csrfToken();
  return token.length > 0 && form.get("csrf") === token;
}
