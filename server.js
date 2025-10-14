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
    await log(`Directory ${dirPath} did not exist, created.`);
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
app.use(helmet());
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
const filePromises = new Set();
app.get("/files", async (req, res) => {
  try {
    if (filePromises.size > 0) {
      await Promise.all(filePromises);
    }

    await ensureDir(FILE_DIR);
    const fileNames = await fs.readdir(FILE_DIR);
    const fileList = fileNames.map((name, idx) => ({ index: idx, name }));
    res.json(fileList);
    await log(`Sent file list, ${fileList.length} file(s) found.`);
  } catch (e) {
    console.log(e);
    res.status(500).json({ error: "Failed to read files" });
    await log(`[error] Failed to read files: ${e}`);
  }
});

// POST /filetransfer/text -> receive text
app.post("/filetransfer/text", express.text(), async (req, res) => {
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

// POST /filetransfer/file -> receive file
app.post("/filetransfer/file", async (req, res) => {
  let fileName = "";
  let pipelineStream;
  try {
    await ensureDir(FILE_DIR);
    console.log("receiving file");
    await log(`Start receiving file`);
    fileName = decodeURIComponent(req.headers["x-filename"]);

    // handle repeated file names
    const fileExt = path.extname(fileName);
    const baseName = path.basename(fileName, fileExt);
    fileName = await getUniqueFileName(FILE_DIR, baseName, fileExt);

    // write file with stream
    const writeStream = createWriteStream(
      path.join(path.join("d:/code/filetransfer/files"), fileName)
    );
    pipelineStream = pipeline(req, writeStream);
    filePromises.add(pipelineStream);
    await pipelineStream;
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
  } finally {
    filePromises.delete(pipelineStream);
  }
});

// GET /filetransfer/download?id= -> send file to download
app.get("/filetransfer/download", async (req, res) => {
  try {
    const id = req.query.id;
    const files = await fs.readdir(FILE_DIR);
    if (isNaN(id) || id < 0 || id >= files.length) return res.status(400).send("Invalid file id");

    const fileName = files[id];
    const filePath = path.join(FILE_DIR, fileName);
    const stats = await fs.stat(filePath);

    await log(`Start sending file "${fileName}" to download`);
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Content-Length": stats.size,
    });

    const readStream = createReadStream(filePath);
    await pipeline(readStream, res);
    await log(`Sent file "${fileName}" for download`);
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
});

// shut down
process.on("SIGINT", () => {
  console.log("Received SIGINT. Closing server...");
  server.close(() => {
    console.log("Sercer closed");
    process.exit(0);
  });
});
process.on("SIGTERM", () => {
  console.log("Received SIGTERM. Closing server...");
  server.close(() => {
    console.log("Sercer closed");
    process.exit(0);
  });
});
