import { list, del } from "@vercel/blob";

function verifyCronRequest(req) {
  const authHeader = req.headers.authorization;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export default async function handler(req, res) {
  if (!verifyCronRequest(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const daysToKeep = 7;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  const cutoffStr = cutoffDate.toISOString().split("T")[0];

  console.log(`[CLEANUP] Deleting files before ${cutoffStr}`);

  try {
    const { blobs } = await list();

    const toDelete = blobs.filter((blob) => {
      const fileDate = blob.pathname.split("/")[0];
      return fileDate < cutoffStr;
    });

    if (toDelete.length === 0) {
      console.log("[CLEANUP] No files to delete");
      return res.status(200).json({ deleted: 0, message: "No files to delete" });
    }

    const pathsToDelete = toDelete.map((b) => b.pathname);
    await del(pathsToDelete);

    console.log(`[CLEANUP] Deleted ${toDelete.length} files`);
    return res.status(200).json({
      deleted: toDelete.length,
      files: pathsToDelete,
    });
  } catch (error) {
    console.error("[CLEANUP] Error:", error);
    return res.status(500).json({ error: "Cleanup failed", details: error.message });
  }
}

export const config = {
  api: {
    bodyParser: true,
  },
};
