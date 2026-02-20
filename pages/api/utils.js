import jwt from "jsonwebtoken";
import { parse } from "cookie";

const JWT_SECRET = process.env.JWT_SECRET;

export function verifyToken(req, res) {
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

  if (!isValid) {
    res.status(401).json({ error: "Unauthorized" });
  }
  return isValid;
}

export function getIp(req) {
  const forwarded = req.headers.get("x-forwarded-for");
  return typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "unknown";
}
