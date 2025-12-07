import fs from "fs/promises";
import path from "path";

// Return the formatted present date
function getDate() {
  const now = new Date();
  return `[${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}-${now
    .getDate()
    .toString()
    .padStart(2, "0")} ${now.getHours().toString().padStart(2, "0")}:${now
    .getMinutes()
    .toString()
    .padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}]`;
}

/**
 * Write message into log
 * @param {string} message
 */
async function log(LOG_FILE, message) {
  await fs.appendFile(LOG_FILE, `${getDate()} ${message}\n`, "utf8");
}

/**
 * Test if the files directory exists
 * @param {string} dirPath
 */
async function ensureDir(LOG_FILE, dirPath) {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
    await log(LOG_FILE, `Directory "${dirPath}" did not exist, created.`);
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

// Clean old files
async function cleanOldFiles(LOG_FILE, FILE_DIR) {
  const expireDay = Number.parseInt(process.env.EXPIREDAY) || 7;
  console.log("Starting cleanup of old files...");
  await log(LOG_FILE, `[info] Cleaning old files older than ${expireDay} days started`);

  const dayBorder = new Date();
  dayBorder.setDate(dayBorder.getDate() - expireDay);

  try {
    await ensureDir(LOG_FILE, FILE_DIR);
    const dirs = await fs.readdir(FILE_DIR, { withFileTypes: true });
    if (dirs.length === 0) return;

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const dirPath = path.join(FILE_DIR, dir.name);
      const dirDate = new Date(dir.name);
      if (isNaN(dirDate) || dirDate > dayBorder) continue;

      try {
        await fs.rm(dirPath, { recursive: true });
        await log(LOG_FILE, `Deleted old directory "${dirPath}"`);
        console.log(`Deleted old directory "${dirPath}"`);
      } catch (e) {
        console.error(`Error deleting directory ${dirPath}:`, e);
        await log(LOG_FILE, `[error] Error deleting directory ${dirPath}: ${e}`);
      }
    }

    console.log("Cleaning finished.");
    await log(LOG_FILE, `[info] Cleaning old files finished`);
  } catch (e) {
    console.log("Failed to clean old directories:", e);
    await log(LOG_FILE, `[error] Failed to clean old directories: ${e}`);
  }
}

async function getPort(PORT, HOST) {
  const http = await import("http");
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
  return await tryPort(PORT);
}

export { getDate, log, ensureDir, getUniqueFileName, cleanOldFiles, getPort };
