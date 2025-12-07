import jwt from "jsonwebtoken";
import crypto from "crypto";
import { log } from "./utils.js";

function createAuth(LOG_FILE) {
  async function checkAuthRedirect(req, res, next) {
    const token = req.cookies.token;

    if (token) {
      try {
        jwt.verify(token, process.env.JWT_SECRET);
        await log(LOG_FILE, `[info] Valid JWT detected from ${req.ip}, redirecting to /success`);
        return res.redirect("/success/");
      } catch {
        await log(LOG_FILE, `[warn] Invalid or expired JWT from ${req.ip}, clearing cookie`);
        console.log("Encounter an expired/Invalid JWT in home page check.");
      }
    }

    next();
  }

  function generateToken(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "3d" });
  }

  function requireAuth(req, res, next) {
    const token = req.cookies.token;
    if (!token) return res.status(401).redirect("/fail/");
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
      return next();
    } catch {
      return res.status(401).redirect("/fail/");
    }
  }

  async function testHandler(req, res) {
    const pwd = Buffer.from(process.env.PASSWORD, "utf8");
    const input = Buffer.from(req.body.pwd, "utf8");
    if (!crypto.timingSafeEqual(pwd, input)) {
      await log(LOG_FILE, `[warn] Failed login attempt from ${req.ip}`);
      return res.redirect("/fail/");
    }
    await log(LOG_FILE, `[info] Successful login from ${req.ip}`);

    const token = generateToken({ user: "authenticated" });
    res.cookie("token", token, {
      httpOnly: true,
      secure: false,
      sameSite: "strict",
      maxAge: 3 * 24 * 60 * 60 * 1000,
    });

    return res.redirect("/success/");
  }

  return { checkAuthRedirect, requireAuth, testHandler };
}

export { createAuth };
