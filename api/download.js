import { downloadToBuffer } from "@vercel/blob";
import archiver from "archiver";
import { verifyToken, getIp } from "./utils.js";

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  if (!(await verifyToken(req, res))) return;
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = getIp(req);
  const { date, names } = req.query;

  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    if (!names || names.length === 0) {
      return res.status(400).json({ error: "No file names provided" });
    }

    const fileNames = names.split(",").filter((n) => n.trim().length > 0);
    for (const name of fileNames) {
      if (name.includes("..") || name.includes("/") || name.includes("\\")) {
        return res.status(400).json({ error: "Invalid file name detected" });
      }
    }

    console.log(`[DOWNLOAD] IP: ${ip} | Date: ${date} | Files: ${fileNames.join(", ")}`);

    if (fileNames.length === 1) {
      const fileName = fileNames[0];
      const pathname = `${date}/${fileName}`;

      const blobData = await downloadToBuffer(pathname);
      const contentType = blobData.contentType || "application/octet-stream";

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

      console.log(`[DOWNLOAD] Single file: ${pathname}, size: ${blobData.buffer.byteLength}`);
      return res.send(blobData.buffer);
    } else if (fileNames.length > 1) {
      const zipName = `files_${date}.zip`;
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.pipe(res);

      let filesAdded = 0;
      const promises = fileNames.map(async (name) => {
        const pathname = `${date}/${name}`;
        try {
          const bufferData = await downloadToBuffer(pathname);
          archive.append(bufferData.buffer, { name });
          filesAdded++;
          console.log(`[ZIP] Added: ${pathname}`);
        } catch (e) {
          console.error(`[ZIP ERROR] File not found: ${pathname} - ${e.message}`);
        }
      });

      await Promise.all(promises);
      await archive.finalize();

      console.log(
        `[DOWNLOAD] ZIP sent: ${zipName}, files: ${filesAdded}/${fileNames.length}, IP: ${ip}`
      );
      return;
    }

    return res.status(400).json({ error: "No files selected for download" });
  } catch (e) {
    console.error(`[DOWNLOAD ERROR] IP: ${ip}, Error: ${e.message}`);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to send download file", details: e.message });
    } else {
      res.end();
    }
  }
}
