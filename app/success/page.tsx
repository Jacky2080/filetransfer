"use client";
import Link from "next/link";
import { useAuth, FileTransfer } from "@/components";
import type { RoomConfig } from "@/components/types";
import "@/components/styles.css";

const mainConfig: RoomConfig = {
  prefix: "files",
  authEndpoint: "/auth/",
  archiveDays: 7,
  enableZipEndpoint: true,
  title: "File Transfer",
};

export default function Success() {
  const { authState, jwtToken, OSSClient } = useAuth(mainConfig);

  return (
    <>
      {authState.message && (
        <div
          className={
            "floating" + (authState.state === 0 ? "" : authState.state === 1 ? " success" : " fail")
          }
        >
          {authState.message}
        </div>
      )}
      <div className="header">
        <div className="title">{mainConfig.title}</div>
        <Link href="/deepseek">DeepSeek</Link>
        <Link href="/?change">Change Room</Link>
        <Link href="/convert">Convert</Link>
      </div>
      <FileTransfer jwtToken={jwtToken} OSSClient={OSSClient} config={mainConfig} />
      <footer>&copy; 2026 Jacky</footer>
    </>
  );
}
