import fs from "fs/promises";
import path from "path";
import { log } from "./utils.js";

class DownloadLogger {
  constructor(LOG_FILE) {
    this.LOG_FILE = LOG_FILE;
    this.logFile = path.join(this.LOG_FILE, "..", "download.json");
    this.cache = new Map();
    this.INTERVAL = 5 * 60 * 1000;
    this.timer = setInterval(() => this.flush(), this.INTERVAL);
  }

  // Log the download record to cache
  logger(ip, fileNames, date) {
    const record = {
      timestamp: new Date().toISOString(),
      download_date: date,
      files: fileNames,
    };
    if (!this.cache.has(ip)) {
      this.cache.set(ip, []);
    }
    this.cache.get(ip).push(record);
  }

  // Flush the cache to log file every 5 minutes
  async flush() {
    await log(this.LOG_FILE, `[info] [DownloadLogger] Starting flushing cache`);
    try {
      // Get existing records
      let data;
      try {
        const content = await fs.readFile(this.logFile, "utf-8");
        data = JSON.parse(content);
      } catch {
        data = {};
      }

      // Add new records
      for (const [ip, records] of this.cache) {
        if (!data[ip]) {
          data[ip] = [];
        }
        data[ip].push(...records);
        data[ip].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Remove duplicates
        const deduped = [];
        let lastTime = null;
        let lastFiles = null;
        for (const record of data[ip]) {
          const currentTime = new Date(record.timestamp).getTime();
          const currentFiles = [...record.files].sort().join(",");
          if (!lastTime || currentTime - lastTime >= 3000 || currentFiles !== lastFiles) {
            deduped.push(record);
            lastTime = currentTime;
            lastFiles = currentFiles;
          }
          // else escape
        }
        data[ip] = deduped;
      }

      // Write to file
      await fs.writeFile(this.logFile, JSON.stringify(data));
      if (this.cache.size > 0) {
        await log(
          this.LOG_FILE,
          `[info] [DownloadLogger] saved ${this.cache.size} download records`
        );
      }
      this.cache.clear();
    } catch (e) {
      await log(
        this.LOG_FILE,
        `[error] [DownloadLogger] Error when saving cache: ${e}, ${e.stack}`
      );
    }
  }

  // Get record when visiting /monit
  async getMonitData() {
    if (this.cache.size > 0) {
      console.log(`[info][DownloadLogger] /monit visited, flushing cache first`);
      await this.flush();
    }

    try {
      const content = await fs.readFile(this.logFile, "utf8");
      return JSON.parse(content);
    } catch (error) {
      if (error.code === "ENOENT") {
        return {};
      }
      throw error;
    }
  }

  async shutdown() {
    console.log("Shutting down logger in the func...");
    if (this.timer) {
      clearInterval(this.timer);
    }
    if (this.cache.size > 0) {
      await log(this.LOG_FILE, `[info] [DownloadLogger] Shut down, flush cache`);
      await this.flush();
      console.log("Cache flushed");
    }
  }
}

export default DownloadLogger;
