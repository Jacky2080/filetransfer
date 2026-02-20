import { put, list } from "@vercel/blob";
import { verifyToken, getIp } from "./utils";

async function getUniqueBlobName(prefix, name, ext) {
  const { blobs } = await list({ prefix: `${prefix}/${name}${ext}` });
  if (blobs.length === 0) {
    return `${name}${ext}`;
  }

  let i = 1;
  while (true) {
    const uniqueName = `${name}_${i}${ext}`;
    const { blobs: existing } = await list({ prefix: `${prefix}/${uniqueName}` });
    if (existing.length === 0) {
      return uniqueName;
    }
    i++;
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (!verifyToken(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const start = Date.now();
  const ip = getIp(req);

  try {
    const todayRaw = new Date();
    const today = `${todayRaw.getFullYear()}-${(todayRaw.getMonth() + 1)
      .toString()
      .padStart(2, "0")}-${todayRaw.getDate().toString().padStart(2, "0")}`;
    console.log(`[UPLOAD] Start receiving file from IP ${ip}`);
    let fileName = decodeURIComponent(req.headers["x-filename"]);
    fileName = fileName.replace(/[/\\?%*:|"<>]/g, "_");
    if (fileName.includes("..")) {
      fileName = fileName.replace(/\.\./g, "");
    }

    // Handle repeated file names
    const fileExt = fileName.includes(".") ? "." + fileName.split(".").pop() : "";
    const baseName = fileExt ? fileName.slice(0, -fileExt.length) : fileName;
    fileName = await getUniqueBlobName(today, baseName, fileExt);

    // Upload to vercel
    const blob = await put(`${today}/${fileName}`, req, {
      access: "private",
      contentType: req.headers["x-filetype"] || "application/octet-stream",
    });

    const duration = Date.now() - start;
    const contentLength = req.headers["content-length"] || "unknown";

    console.log(
      `[UPLOAD] File "${fileName}" received successfully from IP ${ip}, ` +
        `size=${contentLength} bytes, duration=${duration}ms, path=${blob.pathname}`
    );

    return res.status(200).json({
      success: true,
      message: `file ${fileName} received`,
      pathname: blob.pathname,
    });
  } catch (e) {
    console.error(`[UPLOAD ERROR] IP: ${ip}, Error: ${e.message}`);
    return res.status(500).json({ error: "Failed to receive file", details: e.message });
  }
}
