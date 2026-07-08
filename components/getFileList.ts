import OSS from "ali-oss";
import { padDate } from "./getToday";
import type { FileObj, RoomConfig } from "./types";

export async function getFileList(
  date: string | null,
  client: OSS,
  config: RoomConfig
): Promise<FileObj[]> {
  const prefixForDate = (d: string) => `${config.prefix}/${d}/`;

  if (date) {
    // Specific date fetch (for archive/overflow dates)
    const prefix = prefixForDate(date);
    const result = (await client.list({ prefix })) as { objects: FileObj[] };
    return result.objects
      .filter((f) => f.name !== prefix)
      .map((f) => ({
        name: f.name.replace(config.prefix + "/", ""),
        url: f.url,
        storageClass: f.storageClass,
      }));
  }

  // Null date: fetch last (archiveDays + 1) days
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() + 1);

  const daysToFetch = config.archiveDays + 1;
  const fileList: FileObj[] = [];
  for (let i = 0; i < daysToFetch; i++) {
    now.setDate(now.getDate() - 1);
    const prefix = prefixForDate(padDate(now));
    const result = (await client.list({ prefix })) as { objects: FileObj[] };
    fileList.push(
      ...result.objects
        .filter((f) => f.name !== prefix)
        .map((f) => ({
          name: f.name.replace(config.prefix + "/", ""),
          url: f.url,
          storageClass: f.storageClass,
        }))
    );
  }
  return fileList;
}
