import { list } from "@vercel/blob";
import { verifyToken, getIp } from "./utils.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (!(await verifyToken(req, res))) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = getIp(req);
  const { date } = req.query;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Invalid or missing date" });
  }

  try {
    const { blobs } = await list({ prefix: `${date}/` });

    const fileList = blobs.map((b) => ({
      name: b.pathname.replace(`${date}/`, ""),
      size: b.size,
      uploadedAt: b.uploadedAt,
    }));

    console.log(`[FILES] IP: ${ip} | Date: ${date} | Count: ${fileList.length}`);
    return res.status(200).json({ fileList });
  } catch (e) {
    console.error(`[FILES ERROR] IP: ${ip}, Error: ${e.message}`);
    return res.status(500).json({ error: "Failed to list files", details: e.message });
  }
}
