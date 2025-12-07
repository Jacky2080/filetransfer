import fs from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import archiver from "archiver";
import { log, ensureDir, getDate, getUniqueFileName } from "./utils.js";

// Router exports handler factories. Server registers paths.

function createFilesHandler({ FILE_DIR, LOG_FILE }) {
  return async function filesHandler(req, res) {
    try {
      const date = req.query.date;
      await ensureDir(LOG_FILE, FILE_DIR);
      let fileNames;
      try {
        await fs.access(path.join(FILE_DIR, date));
        fileNames = await fs.readdir(path.join(FILE_DIR, date));
      } catch {
        fileNames = [];
      }
      const fileList = fileNames.map((name, idx) => ({ index: idx, name }));
      res.json(fileList);
      await log(LOG_FILE, `Sent file list date ${date}, ${fileList.length} file(s) found.`);
    } catch (e) {
      console.log(e);
      res.status(500).json({ error: "Failed to read files" });
      await log(LOG_FILE, `[error] Failed to read files: ${e}`);
    }
  };
}

function createTextHandler({ DIR, LOG_FILE }) {
  return async function textHandler(req, res) {
    try {
      const content = req.body.trim();
      if (!content) return res.status(400).send("Empty text");
      await fs.appendFile(path.join(DIR, "text.log"), `${getDate()}\n${content}\n\n`, "utf8");
      await log(LOG_FILE, `Received text: ${JSON.stringify(content)}`);
      console.log(`text received: ${content}`);
      res.send("text received");
    } catch (e) {
      console.log(e);
      res.status(500).send("Failed to receive text");
      await log(LOG_FILE, `[error] Failed to receive text: ${e}`);
    }
  };
}

function createFileUploadHandler({ FILE_DIR, LOG_FILE }) {
  return async function fileUploadHandler(req, res) {
    const todayRaw = new Date();
    const today = `${todayRaw.getFullYear()}-${(todayRaw.getMonth() + 1)
      .toString()
      .padStart(2, "0")}-${todayRaw.getDate().toString().padStart(2, "0")}`;
    const start = Date.now();
    let fileName = "";
    try {
      await ensureDir(LOG_FILE, path.join(FILE_DIR, today));
      console.log("receiving file");
      await log(LOG_FILE, `[info] Start receiving file from ${req.ip}`);
      fileName = decodeURIComponent(req.headers["x-filename"]).replace(/[/\\?%*:|"<>]/g, "_");
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

      const duration = Date.now() - start;
      await log(
        LOG_FILE,
        `[info] File "${fileName}" received successfully from ${req.ip}, size=${
          req.headers["content-length"] || "unknown"
        } bytes, duration=${duration}ms`
      );
    } catch (e) {
      console.log(e);
      res.status(500).send("Failed to receive file");
      await log(LOG_FILE, `[error] Failed to receive file: ${e}`);
    }
  };
}

function createDownloadHandler({ FILE_DIR, LOG_FILE }) {
  return async function downloadHandler(req, res) {
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
            await log(LOG_FILE, `[error] Failed to send single file: ${err}`);
            if (!res.headersSent) {
              res.status(500).send("Failed to send download file");
            }
          } else {
            await log(
              LOG_FILE,
              `Sent file "${date}/${finalFileName}" to IP ${req.ip} for download`
            );
          }
        });
      } else if (fileNames.length > 1) {
        const zipName = `files_${date}.zip`;
        res.attachment(zipName);
        const archive = archiver("zip");

        archive.on("error", async (err) => {
          console.error("Archiver error:", err);
          await log(LOG_FILE, `[error] Failed to create archive: ${err}`);
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
            await log(LOG_FILE, `[error] File not found for zip: "${date}/${name}"`);
          }
        }

        archive.on("finish", async () => {
          console.log(`Zip archive sent: ${zipName}, files added: ${filesAdded}`);
          await log(
            LOG_FILE,
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
      await log(LOG_FILE, `[error] Failed to send file: ${e}`);
      if (!res.headersSent) {
        res.status(500).send("Failed to send download file");
      } else {
        res.end();
      }
    }
  };
}

function createErrorHandler({ LOG_FILE }) {
  return async function errorHandler(err, req, res, next) {
    await log(
      LOG_FILE,
      `[error] Path: ${req.originalUrl}, Method: ${req.method}, Error: ${err.stack || err.message}`
    );
    console.error(err.stack || err.message);
    const statusCode = err.status || 500;
    return res.status(statusCode).send("An unexpected error occurred.");
  };
}

export {
  createFilesHandler,
  createTextHandler,
  createFileUploadHandler,
  createDownloadHandler,
  createErrorHandler,
};
