import { NextResponse, type NextRequest } from "next/server";

// Lightweight middleware — no Supabase imports, no network calls.
// JWT validation happens in API routes and server components.
export function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Redirect bare root to login
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Public routes that never require a session
  const publicPrefixes = ["/login", "/forgot-password", "/signup", "/api/auth/"];
  if (publicPrefixes.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Supabase stores the session as sb-<project-ref>-auth-token (optionally chunked)
  const hasSession = request.cookies.getAll().some((c) =>
    c.name.includes("-auth-token")
  );

  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
