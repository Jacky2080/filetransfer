"use client";
import { useState, useEffect } from "react";
import OSS from "ali-oss";
import { getToday } from "./getToday";
import { getFileList } from "./getFileList";
import DropArea from "./DropArea";
import Search from "./Search";
import type { RoomConfig } from "./types";

const FC_BASE = "https://file-trnsfer-fc-hcuthkwduw.cn-shanghai.fcapp.run";

export default function FileTransfer({
  jwtToken,
  OSSClient,
  config,
}: {
  jwtToken: string | null;
  OSSClient: OSS | null;
  config: RoomConfig;
}) {
  const [date, setDate] = useState(getToday());
  const [fetchedDate, setFetchedDate] = useState<string[]>([]);
  const [fileList, setFileList] = useState<{ name: string; url: string; storageClass?: string }[]>(
    []
  );
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [notice, setNotice] = useState("");
  let expireTimeout: NodeJS.Timeout | null = null;

  // Update file list when changing selected date
  useEffect(() => {
    const updateDate = async () => {
      if (!OSSClient) return;
      setSelectedNames([]);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = new Date(date);
      target.setHours(0, 0, 0, 0);
      const days = Math.ceil((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
      try {
        if (date === getToday()) {
          const newFileList = await getFileList(null, OSSClient, config);
          setFileList(newFileList);
        } else if (days > config.archiveDays && !fetchedDate.includes(date)) {
          setFetchedDate((prev) => [...prev, date]);
          const dateList = await getFileList(date, OSSClient, config);
          setFileList((prev) => [...prev, ...dateList]);
        }
      } catch {
        console.error(`Error when getting file list of date ${date}`);
      }
    };
    updateDate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, OSSClient]);

  const handleCheck = (name: string) => {
    setSelectedNames((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  const handleSelectAll = () =>
    fileList.filter((f) => f.name.startsWith(`${date}/`)).length === selectedNames.length
      ? setSelectedNames([])
      : setSelectedNames(fileList.filter((f) => f.name.startsWith(`${date}/`)).map((f) => f.name));

  const onUploadFinished = async () => {
    if (!OSSClient) return;
    if (date === getToday()) {
      const newFileList = await getFileList(null, OSSClient, config);
      setFileList(newFileList);
    }

    // Poll /zip only when zip endpoint is enabled
    if (config.enableZipEndpoint) {
      let ok = false;
      let retries = 0;
      while (!ok && retries < 5) {
        console.log("fetch /zip");
        const response = await fetch(`${FC_BASE}/zip`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${jwtToken}`,
            "Content-Type": "application/json",
          },
        });

        if (response.status === 201) {
          ok = true;
          const result = await response.json();
          console.log(result.name);
        } else {
          retries++;
          if (retries < 5) {
            await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
          }
        }
      }
    }
  };

  async function getRestoreStatus(
    fileName: string
  ): Promise<"restoring" | "restored" | "unrestored"> {
    const res = await OSSClient!.head(fileName);
    const restore = res.res.headers["x-oss-restore"];
    if (!restore) return "unrestored";
    else if (restore.includes('ongoing-request="false"')) return "restored";
    else return "restoring";
  }

  async function downloadFiles() {
    if (selectedNames.length === 0 || downloading) return;
    if (!OSSClient || !jwtToken) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    const days = Math.ceil((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
    if (days > config.archiveDays && selectedNames.length > 1) {
      window.alert("Some of the selected files are archived, please download one by one.");
      setNotice("Some of the selected files are archived, please download one by one.");
      setTimeout(() => setNotice(""), 5000);
      return;
    }

    setDownloadUrl("");
    setDownloading(true);
    const link = document.createElement("a");
    if (expireTimeout) clearTimeout(expireTimeout);

    try {
      if (selectedNames.length === 1) {
        // Download single file
        const selectedFile = selectedNames[0];
        const ossPath = `${config.prefix}/${selectedFile}`;

        // Check storage class and handle archive restore
        const headResult = await OSSClient!.head(ossPath);
        if (headResult.res.headers["x-oss-storage-class"] !== "Standard") {
          const restoreStatus = await getRestoreStatus(ossPath);

          async function checkRestoreStatus() {
            const status = await getRestoreStatus(ossPath);
            if (status === "restored") downloadFiles();
            else setTimeout(checkRestoreStatus, 5000);
          }

          if (restoreStatus === "unrestored") {
            OSSClient!.restore(ossPath, { Days: 1 });
            setNotice(`Restoring file ${selectedFile}...`);
            setTimeout(checkRestoreStatus, 40000);
            return;
          } else if (restoreStatus === "restoring") {
            setNotice(`Still restoring file ${selectedFile}...`);
            setTimeout(checkRestoreStatus, 5000);
            return;
          } else {
            setNotice("File restored!");
            setTimeout(() => setNotice(""), 1000);
          }
        }

        console.log(`downloading file ${selectedFile}`);
        const url = OSSClient!.signatureUrl(ossPath, {
          "content-disposition": `attachment; filename=${selectedFile.replace(`${date}/`, "")}`,
          "expires": 300,
        });
        link.href = url;
        link.download = selectedFile.replace(`${date}/`, "");
      } else if (
        config.enableZipEndpoint &&
        selectedNames.length === fileList.filter((f) => f.name.startsWith(`${date}/`)).length
      ) {
        // Download all files in a day via pre-built zip (only when zip endpoint is enabled)
        const zipName = `zips/files_${date}.zip`;
        link.href = OSSClient!.signatureUrl(zipName, {
          "content-disposition": `attachment; filename=${zipName}`,
          "expires": 300,
        });
      } else {
        // Download selected files via FC endpoint
        const body: Record<string, unknown> = {
          date: date,
          files: selectedNames.map((f) => f.replace(`${date}/`, "")),
        };
        if (config.room) body.room = config.room;

        const response = await fetch(`${FC_BASE}/download`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${jwtToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) throw "encounter an error when fetching file link";
        const { name } = await response.json();
        const zipName = `files_${date}.zip`;

        const url = OSSClient!.signatureUrl(`zips/temp/${name}`, {
          "content-disposition": `attachment; filename=${encodeURIComponent(zipName)}`,
          "expires": 300,
        });
        link.href = url;
        link.download = zipName;
      }

      // Call /oper to log download
      fetch(`${FC_BASE}/oper`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${jwtToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          oper: "download",
          files: selectedNames.map((f) => f.replace(`${date}/`, "")),
          date,
        }),
      });
    } catch (e) {
      alert(`Error when downloading: ${e}`);
    } finally {
      setDownloadUrl(link.href);
      link.click();
      setDownloading(false);
      setSelectedNames([]);
      expireTimeout = setTimeout(() => setDownloadUrl(""), 300000);
    }
  }

  return (
    <form className="file-form">
      <DropArea
        onUploadFinished={onUploadFinished}
        client={OSSClient}
        config={config}
        jwtToken={jwtToken}
      />
      <div>
        <div className="fetch-header">
          <h3>Fetch File</h3>
          <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button type="button" id="select-all-btn" onClick={handleSelectAll}>
            {fileList.filter((f) => f.name.startsWith(`${date}/`)).length === selectedNames.length
              ? "Deselect"
              : "Select All"}
          </button>
          <Search fileList={fileList} setDate={setDate} />
        </div>
        <div id="files">
          {fileList
            .filter((f) => f.name.startsWith(`${date}/`))
            .map((f) => (
              <div
                className={`options${f.storageClass && f.storageClass !== "Standard" ? " options-blue" : ""}`}
                key={f.url}
              >
                <input
                  type="checkbox"
                  id={f.url}
                  className="checkbox-input"
                  checked={selectedNames.includes(f.name)}
                  onChange={() => handleCheck(f.name)}
                ></input>
                <label htmlFor={f.url} className="checkbox-label">
                  {f.name.replace(`${date}/`, "")}
                </label>
              </div>
            ))}
        </div>
        <button type="button" id="fetchBtn" onClick={downloadFiles} disabled={downloading}>
          {downloading ? "Downloading" : "Fetch"}
        </button>
        <p className="url" style={downloadUrl ? { display: "block" } : { display: "none" }}>
          Download should have begun, or click <a href={downloadUrl}>here</a> to download.
          <br />
          Notice: The URL will expire in 5 minutes.
        </p>
        <p className="url" style={notice ? { display: "block" } : { display: "none" }}>
          {notice}
        </p>
      </div>
    </form>
  );
}
