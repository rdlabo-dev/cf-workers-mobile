import { NextRequest, NextResponse } from "next/server";
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname !== "/account") {
    const response = NextResponse.next();
    response.headers.set("x-sample-middleware", "ran");
    return response;
  }
  if (request.cookies.has("__Host-demo_csrf")) return NextResponse.next();
  const csrf = crypto.randomUUID();
  const headers = new Headers(request.headers);
  const cookie = headers.get("cookie");
  headers.set(
    "cookie",
    `${cookie ? cookie + "; " : ""}__Host-demo_csrf=${csrf}`,
  );
  const response = NextResponse.next({ request: { headers } });
  response.cookies.set("__Host-demo_csrf", csrf, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 3600,
  });
  return response;
}
export const config = { matcher: ["/details", "/account"] };
