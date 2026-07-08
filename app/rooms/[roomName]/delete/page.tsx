"use client";
import { use } from "react";
import { useAuth, DeleteForm } from "@/components";
import type { RoomConfig } from "@/components/types";
import "./styles.css";

export default function Delete({ params }: { params: Promise<{ roomName: string }> }) {
  const { roomName } = use(params);

  const roomConfig: RoomConfig = {
    prefix: `rooms/${roomName}`,
    authEndpoint: "/auth",
    room: roomName,
    archiveDays: 14,
    enableZipEndpoint: false,
    title: "",
  };

  const { jwtToken, OSSClient } = useAuth(roomConfig);

  if (!OSSClient || !jwtToken) return null;

  return <DeleteForm OSSClient={OSSClient} jwtToken={jwtToken} config={roomConfig} />;
}
