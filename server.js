#!/usr/bin/env node
import https from "https";
import http from "http";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import express from "express";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import notifier from "node-notifier";
import { pipeline } from "stream/promises";
import os from "os";
import archiver from "archiver";
import morgan from "morgan";
import { config } from "dotenv";
config();

const DIR = import.meta.dirname;
const LOG_FILE = path.join(DIR, "server.log");
const FILE_DIR = path.join(DIR, "files/");
const TRAFFIC_LOG_FILE = path.join(DIR, "traffic.log");

// Return the formatted present date
function getDate() {
  const now = new Date();
  return `[${now.getFullYear()}-${(now.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${now.getDate()} ${now.getHours().toString().padStart(2, "0")}:${now
    .getMinutes()
    .toString()
    .padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}]`;
}

/**
 * Write message into log
 * @param {string} message
 */
async function log(message) {
  await fs.appendFile(LOG_FILE, `${getDate()} ${message}\n`, "utf8");
}

/**
 * Test if the files directory exists
 * @param {string} dirPath
 */
async function ensureDir(dirPath) {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
    await log(`Directory "${dirPath}" did not exist, created.`);
  }
}

/**
 * Get unique file name
 * @param {string} dir
 * @param {string} name
 * @param {string} ext
 */
async function getUniqueFileName(dir, name, ext) {
  let i = 0;
  let uniqueName = name + ext;
  while (true) {
    try {
      await fs.access(path.join(dir, uniqueName));
      i++;
      uniqueName = `${name}_${i}${ext}`;
    } catch {
      break;
    }
  }
  return uniqueName;
}

// HTTPS configuration
const sslOptions = {
  key: await fs.readFile(path.join(DIR, "key/key.pem")),
  cert: await fs.readFile(path.join(DIR, "key/cert.pem")),
  // Enable HTTP/2 if available
  allowHTTP1: true,
  // Recommended security options
  minVersion: "TLSv1.2",
  ciphers: [
    "TLS_AES_256_GCM_SHA384",
    "TLS_CHACHA20_POLY1305_SHA256",
    "TLS_AES_128_GCM_SHA256",
    "ECDHE-RSA-AES128-GCM-SHA256",
    "!DSS",
    "!aNULL",
    "!eNULL",
    "!EXPORT",
    "!DES",
    "!RC4",
    "!3DES",
    "!MD5",
    "!PSK",
  ].join(":"),
  honorCipherOrder: true,
};

// Express setup
const app = express();
app.use(
  helmet({
    contentSecurityPolicy: false,
    strictTransportSecurity: false,
    crossOriginOpenerPolicy: false,
    originAgentCluster: false,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text());
app.use(cookieParser());
app.set("trust proxy", true);

const accessLogStream = createWriteStream(TRAFFIC_LOG_FILE, { flags: "a" });
app.use(morgan("combined", { stream: accessLogStream }));

app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

async function checkAuthRedirect(req, res, next) {
  const token = req.cookies.token;

  if (token) {
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      await log(`[info] Valid JWT detected from ${req.ip}, redirecting to /success`);
      return res.redirect("/success/");
    } catch {
      await log(`[warn] Invalid or expired JWT from ${req.ip}, clearing cookie`);
      console.log("Encounter an expired/Invalid JWT in home page check.");
    }
  }

  next();
}

app.get("/", checkAuthRedirect, (req, res) => {
  res.sendFile(path.join(DIR, "frontend/index.html"));
});

// Serve static files
app.use(
  "/fail",
  express.static(path.join(DIR, "frontend/fail"), {
    dotfiles: "ignore",
    etag: true,
    extensions: ["html"],
    index: "fail.html",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    redirect: true,
  })
);

app.use(
  express.static(path.join(DIR, "frontend"), {
    dotfiles: "ignore",
    etag: true,
    extensions: ["html"],
    maxAge: 30 * 24 * 60 * 60 * 1000,
    redirect: true,
  })
);

// Authentication
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

// Test password
app.post("/test", async (req, res) => {
  const pwd = process.env.PASSWORD;
  const input = req.body.pwd;
  if (pwd !== input) {
    await log(`[warn] Failed login attempt from ${req.ip}`);
    return res.redirect("/fail/");
  }
  await log(`[info] Successful login from ${req.ip}`);

  const token = generateToken({ user: "authenticated" });
  res.cookie("token", token, {
    httpOnly: true,
    secure: false,
    sameSite: "strict",
    maxAge: 3 * 24 * 60 * 60 * 1000,
  });

  return res.redirect("/success/");
});

app.get("/success", requireAuth, (req, res) => {
  res.sendFile(path.join(import.meta.dirname, "frontend/success/success.html"));
});

// GET /files -> return the file list
app.get("/files", requireAuth, async (req, res) => {
  try {
    const date = req.query.date;
    await ensureDir(FILE_DIR);
    let fileNames;
    try {
      await fs.access(path.join(FILE_DIR, date));
      fileNames = await fs.readdir(path.join(FILE_DIR, date));
    } catch {
      fileNames = [];
    }
    const fileList = fileNames.map((name, idx) => ({ index: idx, name }));
    res.json(fileList);
    await log(`Sent file list date ${date}, ${fileList.length} file(s) found.`);
  } catch (e) {
    console.log(e);
    res.status(500).json({ error: "Failed to read files" });
    await log(`[error] Failed to read files: ${e}`);
  }
});

// POST /text -> receive text
app.post("/text", requireAuth, express.text({ limit: "1mb" }), async (req, res) => {
  try {
    const content = req.body.trim();
    if (!content) return res.status(400).send("Empty text");
    await fs.appendFile(path.join(DIR, "text.log"), `${getDate()}\n${content}\n\n`, "utf8");
    await log(`Received text: ${JSON.stringify(content)}`);
    console.log(`text received: ${content}`);
    res.send("text received");
  } catch (e) {
    console.log(e);
    res.status(500).send("Failed to receive text");
    await log(`[error] Failed to receive text: ${e}`);
  }
});

// POST /file -> receive file
app.post("/file", requireAuth, async (req, res) => {
  const today = new Date().toLocaleDateString("zh-CN").replaceAll("/", "-");
  const start = Date.now();
  let fileName = "";
  try {
    await ensureDir(path.join(FILE_DIR, today));
    console.log("receiving file");
    await log(`[info] Start receiving file from ${req.ip}`);
    fileName = decodeURIComponent(req.headers["x-filename"]).replace(/[\/\\?%*:|"<>]/g, "_");
    if (fileName.includes("..")) {
      fileName = fileName.replace(/\.\./g, "");
    }

    // Handle repeated file names
    const fileExt = path.extname(fileName);
    const baseName = path.basename(fileName, fileExt);
    fileName = await getUniqueFileName(path.join(FILE_DIR, today), baseName, fileExt);

    // Write file with stream
    const writeStream = createWriteStream(path.join(FILE_DIR, today, fileName));
    await pipeline(req, writeStream);
    res.send(`file ${fileName} received`);
    console.log(`file ${fileName} received`);

    // Send system notification and write into log
    // notifier.notify({
    //   title: "File received",
    //   message: `File ${fileName} received`,
    //   appID: "com.node.filetransfer",
    //   timeout: 1,
    //   icon: null,
    //   sound: false,
    // });
    const duration = Date.now() - start;
    await log(
      `[info] File "${fileName}" received successfully from ${req.ip}, size=${
        req.headers["content-length"] || "unknown"
      } bytes, duration=${duration}ms`
    );
  } catch (e) {
    console.log(e);
    res.status(500).send("Failed to receive file");
    await log(`[error] Failed to receive file: ${e}`);
  }
});

// GET /download?id= -> send file to download
app.get("/download", requireAuth, async (req, res) => {
  try {
    const date = req.query.date;
    const namesString = req.query.names;

    // Verify date and names format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).send("Invalid date format.");

    if (!namesString || namesString.length === 0) {
      return res.status(400).send("No file names provided.");
    }
    const fileNames = namesString.split(",").filter((n) => n.trim().length > 0);
    for (const name of fileNames) {
      if (name.includes("..") || path.isAbsolute(name) || name.includes(path.sep))
        return res.status(400).send("Invalid file name detected.");
    }

    const dateDir = path.join(FILE_DIR, date);

    if (fileNames.length === 1) {
      const finalFileName = path.basename(fileNames[0]);
      const filePath = path.join(dateDir, finalFileName);
      return res.download(filePath, async (err) => {
        if (err) {
          console.log(err);
          await log(`[error] Failed to send single file: ${err}`);
          if (!res.headersSent) {
            res.status(500).send("Failed to send download file");
          }
        } else {
          await log(`Sent file "${date}/${finalFileName}" to IP ${req.ip} for download`);
        }
      });
    } else if (fileNames.length > 1) {
      const zipName = `files_${date}.zip`;
      res.attachment(zipName);
      const archive = archiver("zip");

      archive.on("error", async (err) => {
        console.error("Archiver error:", err);
        await log(`[error] Failed to create archive: ${err}`);
        if (!res.headersSent) {
          res.status(500).send("Failed to create archive.");
        } else {
          res.end();
        }
      });

      res.setHeader("Content-Type", "application/zip");
      archive.pipe(res);

      let filesAdded = 0;
      for (const name of fileNames) {
        const filePath = path.join(dateDir, name);
        try {
          await fs.access(filePath);
          archive.file(filePath, { name: name });
          filesAdded++;
        } catch (e) {
          console.log(`Error when adding ${filePath} to archive: `, e);
          await log(`[error] File not found for zip: "${date}/${name}"`);
        }
      }

      archive.on("finish", async () => {
        console.log(`Zip archive sent: ${zipName}, files added: ${filesAdded}`);
        await log(
          `[info] Sent zip archive "${zipName}" with files ${fileNames
            .map((n) => `"${n}"`)
            .join(", ")} on date ${date} to IP ${req.ip} for download`
        );
      });

      archive.finalize();
      return;
    } else {
      // fileNames.length === 0
      return res.status(400).send("No files selected for download.");
    }
  } catch (e) {
    console.log(e);
    await log(`[error] Failed to send file: ${e}`);
    if (!res.headersSent) {
      res.status(500).send("Failed to send download file");
    } else {
      res.end();
    }
  }
});

// Clean old files
const expireDay = Number.parseInt(process.env.EXPIREDAY) || 7;
async function cleanOldFiles() {
  console.log("Starting cleanup of old files...");
  await log(`[info] Cleaning old files older than ${expireDay} days started`);

  const dayBorder = new Date();
  dayBorder.setDate(dayBorder.getDate() - expireDay);

  try {
    await ensureDir(FILE_DIR);
    const dirs = await fs.readdir(FILE_DIR, { withFileTypes: true });
    if (dirs.length === 0) return;

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const dirPath = path.join(FILE_DIR, dir.name);
      const dirDate = new Date(dir.name);
      if (isNaN(dirDate) || dirDate > dayBorder) continue;

      try {
        await fs.rm(dirPath, { recursive: true });
        await log(`Deleted old directory "${dirPath}"`);
        console.log(`Deleted old directory "${dirPath}"`);
      } catch (e) {
        console.error(`Error deleting directory ${dirPath}:`, e);
        await log(`[error] Error deleting directory ${dirPath}: ${e}`);
      }
    }

    console.log("Cleaning finished.");
    await log(`[info] Cleaning old files finished`);
  } catch (e) {
    console.log("Failed to clean old directories:", e);
    await log(`[error] Failed to clean old directories: ${e}`);
  }
}

// Handle express error
app.use(async (err, req, res, next) => {
  await log(
    `[error] Path: ${req.originalUrl}, Method: ${req.method}, Error: ${err.stack || err.message}`
  );
  console.error(err.stack || err.message);
  const statusCode = err.status || 500;
  return res.status(statusCode).send("An unexpected error occurred.");
});

// Start  server
const PORT = Number.parseInt(process.env.PORT) || 3000;
const ENV = process.env.ENV || "development";
let server;
if (ENV === "development") {
  server = http.createServer(app);
} else if (ENV === "production") {
  server = https.createServer(sslOptions, app);
} else {
  console.log("invalid NODE_ENV, available: development, production");
  process.exit(1);
}
const HOST = process.env.HOST || "0.0.0.0";

async function tryPort(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(port, HOST);
    server.on("listening", () => {
      server.close();
      resolve(port);
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        log(`[warn] Port ${port} is in use, trying ${port + 1}`);
        resolve(tryPort(port + 1));
      } else {
        log(`[error] Port checking failed: ${err.message}`);
        reject(err);
      }
    });
  });
}

const result = [];
for (let net of Object.values(os.networkInterfaces()["WLAN"])) {
  if (net.family === "IPv4" && !net.internal) {
    result.push(net.address);
  }
}

let cleanupInterval;
const availPort = await tryPort(PORT);
await log(`[info] Server starting on ${HOST}:${availPort}, mode=${ENV}`);
server.listen(availPort, HOST, async () => {
  if (ENV === "development") {
    console.log(
      `server running at http://${HOST}:${availPort}, NODE_ENV: development, visit at http://${result[0]}:${availPort}`
    );
  } else {
    console.log(
      `server running at https://${HOST}:${availPort}, NODE_ENV: production, visit at https://${result[0]}:${availPort}`
    );
  }
  await log(
    `[info] Server started successfully at ${
      ENV === "production" ? "https" : "http"
    }://${HOST}:${availPort}`
  );

  cleanOldFiles();
  cleanupInterval = setInterval(cleanOldFiles, 24 * 60 * 60 * 1000);
});

// Shut down
process.on("SIGINT", () => {
  console.log("Received SIGINT. Closing server...");
  if (cleanupInterval) clearInterval(cleanupInterval);
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
process.on("SIGTERM", () => {
  console.log("Received SIGTERM. Closing server...");
  if (cleanupInterval) clearInterval(cleanupInterval);
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
