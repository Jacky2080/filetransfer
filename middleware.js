import { NextResponse } from "next/server";
import { parse } from "cookie";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  // Exclude static resources
  if (pathname.startsWith("/_next") || pathname.startsWith("/api/") || pathname.includes(".")) {
    return NextResponse.next();
  }

  // Verify token
  const cookieHeader = req.headers.get("cookie") || "";
  const cookies = parse(cookieHeader);
  const token = cookies.token;
  let isValid = false;
  if (token) {
    try {
      await jwtVerify(token, JWT_SECRET);
      isValid = true;
    } catch {
      isValid = false;
    }
  }

  const loginUrl = new URL("/fail/index.html", req.url);
  const successUrl = new URL("/success/index.html", req.url);
  if (pathname === "/" || pathname === "/index.html") {
    return isValid ? NextResponse.redirect(successUrl) : NextResponse.redirect(loginUrl);
  }

  if ((pathname.startsWith("/success") || pathname.startsWith("/deepseek")) && !isValid) {
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/index.html", "/success/:path*", "/fail/:path*", "/deepseek/:path*"],
};
