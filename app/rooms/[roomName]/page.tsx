"use client";
import { use } from "react";
import Link from "next/link";
import { useAuth, FileTransfer } from "@/components";
import type { RoomConfig } from "@/components/types";
import "@/components/styles.css";

export default function Room({ params }: { params: Promise<{ roomName: string }> }) {
  const { roomName } = use(params);

  const roomConfig: RoomConfig = {
    prefix: `rooms/${roomName}`,
    authEndpoint: "/auth",
    room: roomName,
    archiveDays: 14,
    enableZipEndpoint: false,
    title: `File Transfer - Room ${roomName[0].toUpperCase() + roomName.slice(1)}`,
  };

  const { authState, jwtToken, OSSClient } = useAuth(roomConfig);

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
        <div className="title title-room">{roomConfig.title}</div>
        <Link href="/?change">Change Room</Link>
      </div>
      <FileTransfer jwtToken={jwtToken} OSSClient={OSSClient} config={roomConfig} />
      <footer>&copy; 2026 Jacky</footer>
    </>
  );
}
