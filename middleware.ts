import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify, importSPKI, SignJWT, importPKCS8 } from "jose"; // Do not import from @/src/jwt

async function verifyCookie(token: string | undefined) {
  if (!token) return false;
  try {
    const publicKey = await importSPKI(
      Buffer.from(process.env.PUBLIC_KEY!, "base64").toString("utf8"),
      "RS256"
    );
    const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
      algorithms: ["RS256"],
    });
    if (protectedHeader.kid !== "transfer-key-v1") return false;
    return payload;
  } catch {
    return false;
  }
}

async function getCookieToken(config: Record<string, string>) {
  const privateKey = await importPKCS8(
    Buffer.from(process.env.PRIVATE_KEY!, "base64").toString("utf8"),
    "RS256"
  );
  return await new SignJWT(config)
    .setProtectedHeader({ alg: "RS256", kid: "transfer-key-v1" })
    .setIssuedAt()
    .setExpirationTime("3d")
    .sign(privateKey);
}

export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === "/" && req.nextUrl.searchParams.has("change")) return;

  const { pathname } = req.nextUrl;
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const token = req.cookies.get("token")?.value;

  if (pathname.startsWith("/fail")) return NextResponse.next();

  if (
    pathname !== "/" &&
    !["/auth", "/success", "/deepseek", "/convert", "/rooms"].some((r) => pathname.startsWith(r))
  )
    return NextResponse.redirect(new URL("/", req.url));

  const payload = await verifyCookie(token);

  const allowedIPs = JSON.parse(process.env.ALLOWED_IP!) as string[];
  if (allowedIPs.includes(ip)) {
    let response = NextResponse.next();
    if (!payload) {
      const newToken = await getCookieToken({ room: "main" });
      response = NextResponse.next();
      response.cookies.set("token", newToken, {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 3 * 24 * 60 * 60,
      });
    }
    if (pathname === "/") return NextResponse.redirect(new URL("/success/", req.url));
    return response;
  }

  if (payload) {
    const room = payload.room;
    console.log(`[info] Valid token from IP ${ip} to ${pathname}`);
    if (pathname === "/") {
      console.log(`Redirect IP ${ip} to room ${room}`);
      if (room === "main") return NextResponse.redirect(new URL("/success/", req.url)); // Redirect to /success if room is main
      return NextResponse.redirect(new URL(`/rooms/${room}/`, req.url)); // Redirect to the corresponding room
    }
    if (room !== "main" && !pathname.startsWith(`/rooms/${room}/`) && !pathname.startsWith("/auth"))
      // Go to where you should!
      return NextResponse.redirect(new URL(`/rooms/${room}/`, req.url));

    if (room === "main" && pathname.startsWith("/rooms/"))
      return NextResponse.redirect(new URL("/success", req.url));

    return NextResponse.next(); // Nothing happens
  } else {
    console.log(
      `[warn] Invalid visit to ${pathname} from IP ${ip}, request body: ${JSON.stringify(req.body)}`
    );

    if (pathname.startsWith("/auth")) {
      return new NextResponse(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    if (pathname === "/") return NextResponse.next();
    return NextResponse.redirect(new URL("/", req.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.ico|.*\\.svg).*)"],
};
