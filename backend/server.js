#!/usr/bin/env node
import https from "https";
import http from "http";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import os from "os";
import morgan from "morgan";
import { config } from "dotenv";
import { log, cleanOldFiles, getPort } from "./src/utils.js";
import { createAuth } from "./src/authentication.js";
import {
  createFilesHandler,
  createTextHandler,
  createFileUploadHandler,
  createDownloadHandler,
  createErrorHandler,
} from "./src/router.js";
config();

const DIR = import.meta.dirname;
const ROOT = path.resolve(DIR, "..");
const LOG_FILE = path.join(DIR, "server.log");
const FILE_DIR = path.join(DIR, "files/");
const TRAFFIC_LOG_FILE = path.join(DIR, "traffic.log");

// HTTPS configuration
const sslOptions = {
  key: await fs.readFile(path.join(DIR, "key/key.pem")),
  cert: await fs.readFile(path.join(DIR, "key/cert.pem")),
  allowHTTP1: true,
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

// Create auth handlers bound to LOG_FILE
const { checkAuthRedirect, requireAuth, testHandler } = createAuth(LOG_FILE);

// Redirect to /success if authenticated
app.get("/", checkAuthRedirect, (req, res) => {
  res.sendFile(path.join(ROOT, "frontend/index.html"));
});

// Serve static files
app.use(
  "/fail",
  express.static(path.join(ROOT, "frontend/fail"), {
    dotfiles: "ignore",
    etag: true,
    extensions: ["html"],
    index: "fail.html",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    redirect: true,
  })
);
app.use(
  express.static(path.join(ROOT, "frontend"), {
    dotfiles: "ignore",
    etag: true,
    extensions: ["html"],
    maxAge: 30 * 24 * 60 * 60 * 1000,
    redirect: true,
  })
);

// Test password
app.post("/test", testHandler);
app.get("/success", requireAuth, (req, res) => {
  res.sendFile(path.join(ROOT, "frontend/success/success.html"));
});

// GET /files -> return the file list
app.get("/files", requireAuth, createFilesHandler({ FILE_DIR, LOG_FILE }));
// POST /text -> receive text
app.post("/text", requireAuth, createTextHandler({ DIR, LOG_FILE }));
// POST /file -> receive file
app.post(
  "/file",
  requireAuth,
  createFileUploadHandler({
    FILE_DIR,
    LOG_FILE,
  })
);
// GET /download?id= -> send file to download
app.get("/download", requireAuth, createDownloadHandler({ FILE_DIR, LOG_FILE }));
// Handle express error
app.use(createErrorHandler({ LOG_FILE }));

// Start server
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

const result = [];
for (const net of Object.values(os.networkInterfaces()["WLAN"])) {
  if (net.family === "IPv4" && !net.internal) {
    result.push(net.address);
  }
}

let cleanupInterval;
const HOST = process.env.HOST || "0.0.0.0";
const availPort = await getPort(PORT, HOST);
await log(LOG_FILE, `[info] Server starting on ${HOST}:${availPort}, mode=${ENV}`);
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
    LOG_FILE,
    `[info] Server started successfully at ${
      ENV === "production" ? "https" : "http"
    }://${HOST}:${availPort}`
  );

  cleanOldFiles(LOG_FILE, FILE_DIR);
  cleanupInterval = setInterval(cleanOldFiles, 24 * 60 * 60 * 1000, LOG_FILE, FILE_DIR);
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
