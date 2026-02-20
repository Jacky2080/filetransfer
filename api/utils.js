import jose from "jose";
import { parse } from "cookie";

const JWT_SECRET = process.env.JWT_SECRET;

export async function verifyToken(req, res) {
  const cookieHeader =
    (typeof req.headers.get === "function" ? req.headers.get("cookie") : req.headers["cookie"]) ||
    "";
  const cookies = parse(cookieHeader);
  const token = cookies.token;
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  let isValid = false;
  if (token) {
    try {
      await jose.jwtVerify(token, JWT_SECRET);
      isValid = true;
    } catch {
      isValid = false;
    }
  }

  if (!isValid) {
    res.status(401).json({ error: "Unauthorized" });
  }
  return isValid;
}

export function getIp(req) {
  const forwarded = req.headers.get("x-forwarded-for");
  return typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "unknown";
}
