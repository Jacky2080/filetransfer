"use client";
import { useState, useRef } from "react";
import OSS from "ali-oss";
import { getToday } from "./getToday";
import { getFileList } from "./getFileList";
import type { RoomConfig } from "./types";

const FC_BASE = "https://file-trnsfer-fc-hcuthkwduw.cn-shanghai.fcapp.run";

export default function DropArea({
  onUploadFinished,
  client,
  config,
  jwtToken,
}: {
  onUploadFinished: () => void;
  client: OSS | null;
  config: RoomConfig;
  jwtToken: string | null;
}) {
  const [highlight, setHighlight] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [statusText, setStatusText] = useState("Drag & Drop files here");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    if (!client) return;

    setIsUploading(true);
    setStatusText(`Uploading ${files.length} file${files.length > 1 ? "(s)" : ""}...`);

    async function getUniqueFileName(fileName: string) {
      const today = getToday();
      let fileList = await getFileList(today, client!, config);
      // Strip date prefix for uniqueness check (getFileList returns "YYYY-MM-DD/filename")
      fileList = fileList.map((f) => ({
        name: f.name.replace(`${today}/`, ""),
        url: f.url,
        storageClass: f.storageClass,
      }));
      const isFileExists = async (name: string) => fileList.some((f) => f.name === name);

      let extName = "";
      const parts = fileName.split(".");
      if (parts.length > 1) extName = "." + parts.pop();
      const baseName = fileName.slice(0, fileName.length - extName.length);

      let i = 0;
      let uniqueName = baseName + extName;
      while (await isFileExists(uniqueName)) {
        i++;
        uniqueName = `${baseName}_${i}${extName}`;
      }
      return uniqueName;
    }

    const allFiles: string[] = [];
    try {
      await Promise.all(
        files.map(async (file) => {
          const cleanName = file.name.replace(/[/\\?%*:|"<>]/g, "_").replace(/\.\./g, "");
          const finalName = await getUniqueFileName(cleanName);
          console.log(`starting to put file ${finalName}`);
          const parallel = 5;
          const partSize = 32 * 1024 * 1024;
          console.time(finalName);
          const path = `${config.prefix}/${getToday()}/${finalName}`;
          if (file.size < 104857600) {
            // Less than 100 MB
            await client.put(path, file, {
              parallel: parallel,
              partSize: partSize,
            });
          } else {
            // Multipart upload for large files
            await client.multipartUpload(path, file);
          }
          console.log(`finished putting file ${finalName}`);
          console.timeEnd(finalName);
          allFiles.push(finalName);
        })
      );

      setStatusText("All files uploaded.");

      // Call /oper to log upload
      fetch(`${FC_BASE}/oper`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${jwtToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          oper: "upload",
          files: allFiles,
          date: getToday(),
        }),
      });
    } catch (err) {
      console.error(err);
      setStatusText("Failed to upload");
    } finally {
      setIsUploading(false);
      setTimeout(() => setStatusText("Drag & Drop files here"), 1500);
      onUploadFinished();
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setHighlight(false);
    const dt = e.dataTransfer;
    const files = Array.from(dt.files).filter((f) => !f.name.toLowerCase().endsWith(".url"));
    uploadFiles(files);
  };

  return (
    <>
      <label htmlFor="drop-area">Drag & Drop Files</label>
      <div
        id="drop-area"
        className={`drop-area ${highlight ? "highlight" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setHighlight(true);
        }}
        onDragLeave={() => setHighlight(false)}
        onDrop={handleDrop}
      >
        {statusText}
      </div>
      <div>
        <label htmlFor="file">Select File</label>
        <input
          type="file"
          id="droparea-file"
          multiple={true}
          ref={fileInputRef}
          onChange={(e) => e.target.files && uploadFiles(Array.from(e.target.files))}
        />
        <button
          type="button"
          id="fileBtn"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? "Sending..." : "Select Files"}
        </button>
      </div>
    </>
  );
}
