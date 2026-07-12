"use server";
import { timingSafeEqual } from "crypto";
import { importPKCS8, SignJWT } from "jose";
import { getCookieToken } from "@/src/jwt";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const privateKey = await importPKCS8(
  Buffer.from(process.env.PRIVATE_KEY!, "base64").toString("utf8"),
  "RS256"
);
const jwtToken = await new SignJWT({ user: "authenticated" })
  .setProtectedHeader({ alg: "RS256", kid: "transfer-key-v1" })
  .setIssuedAt()
  .setExpirationTime("3d")
  .sign(privateKey);

async function setCookie(config: Record<string, string>) {
  const token = await getCookieToken(config);
  const cookieStore = await cookies();
  cookieStore.set("token", token, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 3 * 24 * 60 * 60,
  });
}

export async function authenticate(formData: FormData) {
  const userName = (formData.get("user") || "%%UNKNOWN%%") as string;
  const inputPwd = formData.get("pwd") as string;
  const envPwd = process.env.PASSWORD || "";

  const pwdBuffer = Buffer.from(envPwd, "utf8");
  const inputBuffer = Buffer.from(inputPwd, "utf8");

  const pwdView = new Uint8Array(pwdBuffer);
  const inputView = new Uint8Array(inputBuffer);

  if (pwdBuffer.length !== inputBuffer.length || !timingSafeEqual(pwdView, inputView)) {
    const response = await fetch("https://file-trnsfer-fc-hcuthkwduw.cn-shanghai.fcapp.run/check", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${jwtToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        password: inputPwd,
        user_name: userName,
      }),
    });
    if (response.ok) {
      const json = await response.json();
      const roomName = json.roomName;
      console.log(
        `[AUTH SUCCESS] User name: ${userName}, time: ${new Date().toISOString()} Room: ${roomName}`
      );
      await setCookie({ room: roomName });
      return redirect(`/rooms/${roomName}`);
    }

    console.warn(`[AUTH FAILED] User name: ${userName}, time: ${new Date().toISOString()}`);
    return redirect("/fail");
  }

  await setCookie({ room: "main" });

  console.log(`[AUTH SUCCESS] User name: ${userName}, time: ${new Date().toISOString()}`);

  return redirect("/success");
}
