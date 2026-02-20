import { sign } from "jsonwebtoken";
import { timingSafeEqual } from "crypto";
import { serialize } from "cookie";
import { getIp } from "./utils.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = getIp(req);

  const pwd = Buffer.from(process.env.PASSWORD || "", "utf8");
  const input = Buffer.from(req.body?.pwd || "", "utf8");

  if (pwd.length !== input.length || !timingSafeEqual(pwd, input)) {
    console.warn(`[AUTH FAILED] IP: ${ip} | Time: ${new Date().toISOString()}`);
    return res.redirect("/fail/");
  }

  const token = sign({ user: "authenticated" }, process.env.JWT_SECRET, { expiresIn: "3d" });

  const cookie = serialize("token", token, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 3 * 24 * 60 * 60,
  });

  res.setHeader("Set-Cookie", cookie);
  console.log(`[AUTH SUCCESS] IP: ${ip} | Time: ${new Date().toISOString()}`);

  return res.redirect("/success/");
}
