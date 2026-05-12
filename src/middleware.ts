import { NextResponse, type NextRequest } from "next/server";

// Lightweight shared-password gate. Set APP_PASSWORD in your env (locally and
// on Vercel). The /login page accepts the password and sets an auth cookie;
// every other route requires the cookie.
//
// This is NOT a substitute for per-user auth — it's a single shared secret to
// keep the URL from being open to the public internet. Upgrade to Supabase
// Auth (or NextAuth) when you need real user identities and audit trails.

const AUTH_COOKIE = "sp_auth";
const PUBLIC_PATHS = new Set(["/login", "/api/login"]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow Next.js internals + static assets through. The matcher below also
  // excludes _next/* and the favicon, this is a belt-and-suspenders guard.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/robots.txt"
  ) {
    return NextResponse.next();
  }

  // If APP_PASSWORD isn't configured (local dev with no gate), don't enforce.
  if (!process.env.APP_PASSWORD) return NextResponse.next();

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && cookie === process.env.APP_PASSWORD) {
    return NextResponse.next();
  }

  // Unauthorized — bounce to login, preserving where the user was headed so
  // we can send them back after.
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Run middleware on all routes except Next.js internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
