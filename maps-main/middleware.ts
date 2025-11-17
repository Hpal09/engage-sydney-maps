import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Simple MVP Auth Middleware
 * WARNING: This is a basic implementation for development only!
 * For production, use a proper authentication solution like NextAuth.js
 */

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  // Protect all /admin/* routes
  if (pathname.startsWith("/admin")) {
    const sessionCookie = request.cookies.get("admin_session");

    if (!sessionCookie) {
      // Redirect to login
      const loginUrl = new URL("/admin/login", request.url);
      return NextResponse.redirect(loginUrl);
    }

    // Session exists - allow access
    // Note: Session validation happens in the auth.ts utilities
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
