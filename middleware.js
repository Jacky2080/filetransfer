import { NextResponse } from "next/server";
import { parse } from "cookie";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

export function middleware(req) {
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
      jwt.verify(token, JWT_SECRET);
      isValid = true;
    } catch {
      isValid = false;
    }
  }

  const loginUrl = new URL("/fail/index.html", req.url);
  const successUrl = new URL("/success/index.html", req.url);
  if (pathname === "/" || pathname === "/index.html") {
    if (isValid) {
      return NextResponse.redirect(successUrl);
    } else {
      return NextResponse.redirect(loginUrl);
    }
  }

  if (pathname.startsWith("/success/") || pathname.startsWith("/deepseek/")) {
    if (!isValid) {
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/index.html", "/success/:path*", "/fail/:path*", "/deepseek/:path*"],
};
