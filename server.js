#!/usr/bin/env node
import https from "https";
import http from "http";
import fs from "fs/promises";
import { createReadStream, createWriteStream } from "fs";
import path from "path";
import express from "express";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import notifier from "node-notifier";
import { pipeline } from "stream/promises";
import os from "os";
import archiver from "archiver";
import { config } from "dotenv";
config();

const DIR = import.meta.dirname;
const LOG_FILE = path.join(DIR, "server.log");
const FILE_DIR = path.join(DIR, "files/");

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
  await fs.appendFile(LOG_FILE, `${getDate()} ${message}\n`);
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
// app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text());
app.use(cookieParser());

// CORS & Preflight
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, HEAD, POST");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Filename, X-Filesize, X-Filetype"
  );
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Serve static files
app.use(
  "/fail",
  express.static(path.join(DIR, "frontend/fail"), {
    dotfiles: "ignore",
    etag: true,
    extensions: ["html"],
    index: "fail.html",
    maxAge: "1h",
    redirect: true,
  })
);

app.use(
  express.static(path.join(DIR, "frontend"), {
    dotfiles: "ignore",
    etag: true,
    extensions: ["html", "css", "js"],
    maxAge: "1m",
    redirect: true,
  })
);

// Authentication
function generateToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "3h" });
}

function requireAuth(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.redirect("/fail");
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.redirect("/fail");
  }
}

// Test password
app.post("/test", (req, res) => {
  const pwd = process.env.PWD;
  const input = req.body.pwd;
  if (pwd !== input) {
    return res.redirect("/fail");
  }

  const token = generateToken({ user: "authenticated" });
  res.cookie("token", token, {
    httpOnly: true,
    secure: false,
    sameSite: "strict",
    maxAge: null,
  });

  return res.redirect("/success");
});

app.get("/success", requireAuth, (req, res) => {
  res.sendFile(path.join(import.meta.dirname, "frontend/success/success.html"));
});

// GET /files -> return the file list
app.get("/files", async (req, res) => {
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
    await fs.appendFile(path.join(DIR, "text.log"), `${getDate()}\n${content}\n\n`);
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
  const today = new Date().toLocaleDateString().replaceAll("/", "-");
  let fileName = "";
  try {
    await ensureDir(FILE_DIR);
    await ensureDir(path.join(FILE_DIR, today));
    console.log("receiving file");
    await log(`Start receiving file`);
    fileName = decodeURIComponent(req.headers["x-filename"]).replace(/[\/\\?%*:|"<>]/g, "_");
    if (fileName.includes("..")) {
      fileName = fileName.replace(/\.\./g, "");
    }

    // handle repeated file names
    const fileExt = path.extname(fileName);
    const baseName = path.basename(fileName, fileExt);
    fileName = await getUniqueFileName(FILE_DIR, baseName, fileExt);

    // write file with stream
    const writeStream = createWriteStream(path.join(FILE_DIR, today, fileName));
    await pipeline(req, writeStream);
    res.send(`file ${fileName} received`);
    console.log(`file ${fileName} received`);

    // Send system notification and write into log
    notifier.notify({
      title: "File received",
      message: `File ${fileName} received`,
      appID: "com.node.filetransfer",
      timeout: 1,
      icon: null,
      sound: false,
    });
    await log(`Received file "${fileName}"`);
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
    const names = req.query.names;
    // Verify date and names format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).send("Invalid date format.");
    for (const name of names) {
      if (name.includes("..") || path.isAbsolute(name))
        return res.status(400).send("Invalid file name detected.");
    }
    const fileNames = names.split(",");

    if (fileNames.length === 1)
      return res.download(path.join(FILE_DIR, date, fileNames[0]), async (err) => {
        if (err) {
          console.log(err);
          await log(`[error] Failed to send file: ${err}`);
          if (!res.headersSent) {
            res.status(500).send("Failed to send download file");
          }
        } else {
          await log(`Sent file "${date}/${fileNames[0]}" for download`);
        }
      });

    const zipName = `files_${date}.zip`;
    const archive = archiver("zip");

    res.attachment(zipName);
    res.setHeader("Content-Type", "application/zip");
    archive.pipe(res);

    let filesAdded = 0;
    for (const name of fileNames) {
      const filePath = path.join(FILE_DIR, date, name);
      try {
        await fs.access(filePath);
        archive.file(filePath, { name: name });
        filesAdded++;
      } catch (e) {
        console.log(`Error when adding ${filePath} to archive: `, e);
        await log(`[error] File not found for zip: "${date}/${name}"`);
      }
    }

    archive.on("error", async (err) => {
      console.error("Archiver error:", err);
      await log(`[error] Archiver error: ${err}`);
      if (!res.headersSent) {
        res.status(500).send({ error: err.message });
      } else {
        res.end();
      }
    });

    archive.on("finish", async () => {
      console.log(`Zip archive sent: ${zipName}, files added: ${filesAdded}`);
      await log(`Sent zip archive "${zipName}" with ${filesAdded} file(s) for download`);
    });

    archive.finalize();
    return;
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
  await log("[info] Start cleaning old files");

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
        const filesInDir = await fs.readdir(dirPath);

        for (const file of filesInDir) {
          const filePath = path.join(dirPath, file);
          await fs.unlink(filePath);
        }
      } catch (e) {
        console.error(`Error deleting files in ${dirPath}:`, e);
        await log(`[error] Error deleting files in ${dirPath}: ${e}`);
        continue;
      }
      try {
        await fs.rmdir(dirPath);
        await log(`Deleted old directory: ${dirPath}`);
      } catch (e) {
        console.error(`Error deleting directory ${dirPath}:`, e);
        await log(`[error] Error deleting directory ${dirPath}: ${e}`);
      }
    }

    console.log("Cleaning finished.");
    await log("Cleaning finished.");
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
        resolve(tryPort(port + 1));
      } else {
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
server.listen(availPort, HOST, () => {
  if (ENV === "development") {
    console.log(
      `server running at http://${HOST}:${availPort}, NODE_ENV: development, visit at http://${result[0]}:${availPort}`
    );
  } else {
    console.log(
      `server running at https://${HOST}:${availPort}, NODE_ENV: production, visit at https://${result[0]}:${availPort}`
    );
  }

  cleanOldFiles();
  cleanupInterval = setInterval(cleanOldFiles, 24 * 60 * 60 * 1000);
});

// shut down
process.on("SIGINT", () => {
  console.log("Received SIGINT. Closing server...");
  if (cleanupInterval) clearInterval(cleanupInterval);
  server.close(() => {
    console.log("Sercer closed");
    process.exit(0);
  });
});
process.on("SIGTERM", () => {
  console.log("Received SIGTERM. Closing server...");
  if (cleanupInterval) clearInterval(cleanupInterval);
  server.close(() => {
    console.log("Sercer closed");
    process.exit(0);
  });
});
