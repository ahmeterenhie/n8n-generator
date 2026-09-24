import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const loggedIn = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  // Already signed in: skip the login page
  if (pathname === "/login") {
    return loggedIn ? NextResponse.redirect(new URL("/generator", req.url)) : NextResponse.next();
  }

  if (loggedIn) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ code: "UNAUTHORIZED", error: "Not signed in." }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/login", "/generator/:path*", "/settings/:path*", "/api/generate", "/api/clarify", "/api/plan", "/api/refine", "/api/validate", "/api/test-connection"],
};
