"use client";
import { useState, useEffect } from "react";
import OSS from "ali-oss";
import { getToday } from "./getToday";
import { getFileList } from "./getFileList";
import type { RoomConfig } from "./types";

const FC_BASE = "https://file-trnsfer-fc-hcuthkwduw.cn-shanghai.fcapp.run";

export default function DeleteForm({
  OSSClient,
  jwtToken,
  config,
}: {
  OSSClient: OSS;
  jwtToken: string;
  config: RoomConfig;
}) {
  const [date, setDate] = useState(getToday());
  const [fileList, setFileList] = useState<{ name: string; url: string }[]>([]);
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [btnMsg, setBtnMsg] = useState("Delete");
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [tempName, setTempName] = useState("");

  // Update file list when changing selected date
  useEffect(() => {
    const updateDate = async () => {
      if (!OSSClient) return;
      try {
        const newFileList = await getFileList(date, OSSClient, config);
        setFileList(newFileList.map((f) => ({ ...f, name: f.name.replace(`${date}/`, "") })));
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
    fileList.length === selectedNames.length
      ? setSelectedNames([])
      : setSelectedNames(fileList.map((f) => f.name));

  // Delete multiple files
  async function deleteFiles() {
    if (selectedNames.length === 0) return;
    if (!window.confirm("Sure to delete?")) return;

    setDeleting(true);
    setBtnMsg("Deleting");
    setSelectedNames([]);
    try {
      const files = selectedNames.map((f) => `${config.prefix}/${date}/${f}`);
      await OSSClient!.deleteMulti(files);

      // Call /oper to log deletion
      fetch(`${FC_BASE}/oper`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${jwtToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          oper: "delete",
          files: files.map((f) => f.replace(`${config.prefix}/${date}/`, "")),
          date,
        }),
      });

      // Optionally prompt for /zip request (only when zip endpoint is enabled)
      if (config.enableZipEndpoint) {
        (async function () {
          if (date === getToday() && window.confirm("Send /zip request?")) {
            const response = await fetch(`${FC_BASE}/zip`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${jwtToken}`,
                "Content-Type": "application/json",
              },
            });

            if (response.status === 201) {
              const result = await response.json();
              console.log(result.name);
            } else {
              window.alert("Failed to zip");
            }
          }
        })();
      }
    } catch (e) {
      window.alert(`Failed to delete: ${e}`);
    } finally {
      setDeleting(false);
      setBtnMsg("Delete");
      const newFileList = await getFileList(date, OSSClient!, config);
      setFileList(newFileList.map((f) => ({ ...f, name: f.name.replace(`${date}/`, "") })));
    }
  }

  async function renameFile(dest: string, src: string) {
    setRenaming(true);
    setBtnMsg("Renaming");
    try {
      await OSSClient.copy(dest, src);
      await OSSClient.delete(src);
      const newFileList = await getFileList(date, OSSClient, config);
      setFileList(newFileList.map((f) => ({ ...f, name: f.name.replace(`${date}/`, "") })));
    } catch (e) {
      console.error(`Failed to rename file: ${e}`);
      window.alert("Failed to rename");
    } finally {
      setRenaming(false);
      setBtnMsg("Delete");
    }
  }

  return (
    <form className="delete-form">
      <div>
        <h3>Delete Files</h3>
        <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button type="button" id="select-all-btn" onClick={handleSelectAll}>
          {fileList.length === selectedNames.length ? "Deselect" : "Select All"}
        </button>
        <div id="files">
          {fileList.map((f) => (
            <div className="options" key={f.url}>
              <input
                type="checkbox"
                id={f.url}
                className="checkbox-input"
                checked={selectedNames.includes(f.name)}
                onChange={() => handleCheck(f.name)}
              ></input>
              {editingName === f.name ? (
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onBlur={async () => {
                    setEditingName(null);
                    if (tempName && tempName !== f.name) {
                      const src = `${config.prefix}/${date}/${f.name}`;
                      const dest = `${config.prefix}/${date}/${tempName}`;
                      if (!window.confirm("Sure to rename?")) return;
                      await renameFile(dest, src);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      (e.target as HTMLInputElement).blur();
                    }
                    if (e.key === "Escape") {
                      setEditingName(null);
                    }
                  }}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <label
                  htmlFor={f.url}
                  className="checkbox-label"
                  onDoubleClick={() => {
                    setEditingName(f.name);
                    setTempName(f.name);
                  }}
                >
                  {f.name}
                </label>
              )}
            </div>
          ))}
        </div>
        <button type="button" id="deleteBtn" onClick={deleteFiles} disabled={deleting || renaming}>
          {btnMsg}
        </button>
      </div>
    </form>
  );
}
