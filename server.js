#!/usr/bin/env node
import https from "https";
import http from "http";
import fs from "fs/promises";
import { createReadStream, createWriteStream } from "fs";
import path from "path";
import express from "express";
import helmet from "helmet";
import notifier from "node-notifier";
import { pipeline } from "stream/promises";
import os from "os";
import { config } from "dotenv";
config();

const LOG_FILE = "d:/code/filetransfer/server.log";
const FILE_DIR = "d:/code/filetransfer/files";
const STATIC_DIR = "d:/code/filetransfer";

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
  key: await fs.readFile(path.normalize("D:/code/filetransfer/key.pem")),
  cert: await fs.readFile(path.normalize("D:/code/filetransfer/cert.pem")),
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
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.text({ limit: "50mb" }));

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
  "/filetransfer",
  express.static(path.normalize("d:/code/filetransfer"), {
    dotfiles: "ignore",
    etag: true,
    extensions: ["js", "css"],
    maxAge: "1m",
    redirect: true,
  })
);

app.use(
  express.static(path.normalize("d:/code/filetransfer"), {
    dotfiles: "ignore",
    etag: true,
    extensions: ["html"],
    maxAge: "1m",
    redirect: true,
  })
);

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
    await fs.appendFile(path.join(STATIC_DIR, "text.log"), `${getDate()}\n${content}\n\n`);
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
      path.join(path.normalize("d:/code/filetransfer/files"), fileName)
    );
    pipelineStream = pipeline(req, writeStream);
    filePromises.add(pipelineStream);
    await pipelineStream;
    res.send(`file ${fileName} received`);
    console.log(`file ${fileName} received`);

    // send system notification and write into log
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
const PORT = process.env.PORT || 3000;
const server = https.createServer(sslOptions, app);
// const server = app;
const HOST = process.env.HOST || "0.0.0.0";
server.listen(PORT, HOST, () => {
  const result = [];
  for (let net of Object.values(os.networkInterfaces()["WLAN"])) {
    if (net.family === "IPv4" && !net.internal) {
      result.push(net.address);
    }
  }
  console.log(
    `Express server running at https://${HOST}:${PORT}, or visit at https://${result[0]}:${PORT}`
  );
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
