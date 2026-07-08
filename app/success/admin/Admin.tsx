"use client";
import { useState, useEffect } from "react";
import OSS from "ali-oss";
import "./styles.css";
import dynamic from "next/dynamic";
import { useAuth, DeleteForm, padDate } from "@/components";
import type { RoomConfig } from "@/components/types";

interface FileObj {
  name: string;
  url: string;
  storageClass: string;
  size: number;
}

const adminConfig: RoomConfig = {
  prefix: "files",
  authEndpoint: "/auth/",
  archiveDays: 7,
  enableZipEndpoint: true,
  title: "File Transfer",
};

function CreateRoom({ jwtToken }: { jwtToken: string }) {
  const [name, setName] = useState("");
  const [pwd, setPwd] = useState("");
  const [btnMsg, setBtnMsg] = useState("Create");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (jwtToken) {
      setBtnMsg("Authenticated");
      setTimeout(() => setBtnMsg("Create"), 1000);
    } else setBtnMsg("Authenticating...");
  }, [jwtToken]);

  async function handleSubmit(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    if (!name || !pwd) return;

    setCreating(true);
    setBtnMsg("Creating...");
    try {
      const response = await fetch(
        "https://file-trnsfer-fc-hcuthkwduw.cn-shanghai.fcapp.run/create",
        {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${jwtToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: name,
            password: pwd,
          }),
        }
      );

      if (response.status === 409) {
        const json = await response.json();
        setBtnMsg(json.message);
        return;
      }

      if (!response.ok) {
        setBtnMsg("Failed to create");
        return;
      }

      const json = await response.json();
      setBtnMsg(json.message);
    } catch (e) {
      console.error(e);
      setBtnMsg("Error when creating");
    } finally {
      setName("");
      setPwd("");
      setCreating(false);
      setTimeout(() => setBtnMsg("Create"), 1500);
    }
  }

  return (
    <form className="create-form">
      <h3>Create Rooms</h3>
      <label htmlFor="name">
        Name:
        <input
          type="text"
          id="name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        ></input>
      </label>
      <label htmlFor="pwd">
        Password for Room:
        <input
          type="text"
          id="pwd"
          name="pwd"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
        ></input>
      </label>
      <button disabled={creating} className="delete-duplicate" type="submit" onClick={handleSubmit}>
        {btnMsg}
      </button>
    </form>
  );
}

function DropDuplicate({ OSSClient, jwtToken }: { OSSClient: OSS; jwtToken: string }) {
  const [dup, setDup] = useState<{ [key: string]: FileObj[] }>({});
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [detectBtnMsg, setDetectBtnMsg] = useState("Detect Duplicates");
  const [btnMsg, setBtnMsg] = useState("Delete");
  const [detecting, setDetecting] = useState(false);

  const handleCheck = (name: string) => {
    setSelectedNames((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  async function detectDuplicates() {
    try {
      setDetectBtnMsg("Detecting");
      setDetecting(true);

      const now = new Date();
      now.setDate(now.getDate() + 1);
      const fileList: FileObj[] = [];
      for (let i = 0; i < 7; i++) {
        now.setDate(now.getDate() - 1);
        const prefix = `files/${padDate(now)}/`;
        const list = (await OSSClient.list({
          prefix: prefix,
        })) as { objects: FileObj[] };
        const final = list.objects
          .filter((f) => f.name !== prefix && f.storageClass === "Standard")
          .map((f) => ({
            name: f.name.replace("files/", ""),
            url: f.url,
            storageClass: f.storageClass,
            size: f.size,
          }));
        fileList.push(...final);
      }

      const duplicateMap = new Map<string, FileObj[]>();
      for (const file of fileList) {
        const fileName = file.name
          .slice(11)
          .split("/")
          .pop()!
          .replace(/^~\$/, "")
          .replace(/(?:_\d+)?\.[^\.]+$/, "");
        if (!duplicateMap.has(fileName)) {
          duplicateMap.set(fileName, [file]);
        } else {
          const old = duplicateMap.get(fileName)!;
          duplicateMap.set(fileName, [...old, file]);
        }
      }

      const duplicated: { [key: string]: FileObj[] } = {};
      for (const [name, list] of duplicateMap) {
        if (list.length > 1) {
          duplicated[name] = list;
        }
      }

      setDup(duplicated);
      setDetectBtnMsg("Detect Duplicates");
    } catch (e) {
      console.error("Error when getting duplicates: ", e);
      setDetectBtnMsg("Error");
      setTimeout(() => setDetectBtnMsg("Detect Duplicates"), 3000);
    } finally {
      setDetecting(false);
    }
  }

  async function deleteDuplicates() {
    if (selectedNames.length === 0) return;
    if (!window.confirm("Sure to delete?")) return;

    setBtnMsg("Deleting");
    setSelectedNames([]);
    try {
      const files = selectedNames.map((f) => `files/${f}`);
      await OSSClient!.deleteMulti(files);
      setBtnMsg("Deleted");
      fetch("https://file-trnsfer-fc-hcuthkwduw.cn-shanghai.fcapp.run/oper", {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${jwtToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          oper: "delete",
          files: files.map((f) => f.slice(6)),
          date: "[MULTI]",
        }),
      });
    } catch (e) {
      window.alert(`Failed to delete: ${e}`);
    } finally {
      detectDuplicates();
      setTimeout(() => {
        setBtnMsg("Delete");
      }, 1000);
    }
  }

  return (
    <form className="duplicate-form">
      <div className="dup-header">
        <h3>Drop Duplicates</h3>
        <button type="button" onClick={detectDuplicates} disabled={detecting}>
          {detectBtnMsg}
        </button>
        {Object.keys(dup).length > 0 && (
          <button type="button" onClick={deleteDuplicates} disabled={btnMsg === "Deleting"}>
            {btnMsg}
          </button>
        )}
      </div>

      {Object.keys(dup).length > 0 && (
        <>
          <hr />
          {Object.entries(dup).map(([key, list]) => {
            return (
              <div key={key}>
                <div className="duplicate-name">{key}</div>
                <div id="files">
                  {list.map((f) => (
                    <div className="options" key={f.url}>
                      <input
                        type="checkbox"
                        id={"dup-" + f.url}
                        className="checkbox-input"
                        checked={selectedNames.includes(f.name)}
                        onChange={() => handleCheck(f.name)}
                      ></input>
                      <label htmlFor={"dup-" + f.url} className="checkbox-label">
                        {f.name.slice(11)}
                        <br />
                        <div className="dup-date">{f.name.slice(0, 10)}</div>
                      </label>
                    </div>
                  ))}
                </div>
                <hr />
              </div>
            );
          })}
        </>
      )}
    </form>
  );
}

export default function Admin() {
  const { jwtToken, OSSClient } = useAuth(adminConfig);
  const [showTraffic, setShowTraffic] = useState(false);

  const Traffic = dynamic(() => import("./Traffic"), {
    loading: () => <p>Traffic is Loading...</p>,
  });

  return (
    <>
      {!showTraffic ? (
        <div className="container">
          {OSSClient && jwtToken && (
            <>
              <DeleteForm OSSClient={OSSClient} jwtToken={jwtToken} config={adminConfig} />
              <CreateRoom jwtToken={jwtToken} />
              <DropDuplicate OSSClient={OSSClient} jwtToken={jwtToken} />
            </>
          )}
          <div style={{ alignSelf: "flex-end" }}>
            <button type="button" onClick={() => setShowTraffic(true)}>
              Show Traffic
            </button>
          </div>
        </div>
      ) : (
        <Traffic client={OSSClient} setShowTraffic={setShowTraffic} />
      )}
    </>
  );
}
