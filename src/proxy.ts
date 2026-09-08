import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register");
  const isApiAuth = pathname.startsWith("/api/auth");
  const isRegisterApi = pathname.startsWith("/api/register");
  const isDashboardPage = pathname.startsWith("/dashboard");
  const isPublic =
    pathname === "/" ||
    isAuthPage ||
    isApiAuth ||
    isRegisterApi ||
    isDashboardPage;

  // Don't check auth for public routes
  if (isPublic) {
    return NextResponse.next();
  }

  const token = req.cookies.get("next-auth.session-token") ||
                req.cookies.get("__Secure-next-auth.session-token") ||
                req.cookies.get("authjs.session-token") ||
                req.cookies.get("__Secure-authjs.session-token");
  const isLoggedIn = !!token;

  if (!isLoggedIn && !pathname.startsWith("/uploads")) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard/inbox", req.nextUrl.origin));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
