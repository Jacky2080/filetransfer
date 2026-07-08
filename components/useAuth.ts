"use client";
import { useState, useEffect } from "react";
import type { AuthState, RoomConfig } from "./types";

export function useAuth(config: RoomConfig): {
  authState: AuthState;
  jwtToken: string | null;
  OSSClient: any;
} {
  const [authState, setAuthState] = useState<AuthState>({
    state: 0,
    message: "Authenticating...",
  });
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [OSSClient, setOSSClient] = useState<any>(null);

  useEffect(() => {
    const getAuth = async () => {
      const jwtRes = await fetch(config.authEndpoint);
      if (jwtRes.status === 500 || !jwtRes.ok) {
        setAuthState({ state: 2, message: "Failed to authenticate" });
        throw new Error("Failed to get JWT");
      }
      const { accessKeyId, accessKeySecret, stsToken, bucket, jwtToken } = await jwtRes.json();
      setJwtToken(jwtToken);
      setAuthState({ state: 1, message: "Successfully authenticated" });
      setTimeout(() => setAuthState({ state: 0, message: "" }), 3000);

      // Wake up the FC server (throttled to 10 minutes via sessionStorage)
      const doWakeup = () => {
        fetch("https://file-trnsfer-fc-hcuthkwduw.cn-shanghai.fcapp.run/wakeup", {
          headers: {
            "Authorization": `Bearer ${jwtToken}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          body: JSON.stringify({
            user_name: localStorage.getItem("user_name") || "%%UNKNOWN%%",
            room: config.room || "main",
          }),
        });
      };

      const wakeTime = sessionStorage.getItem("wake_time");
      if (!wakeTime || Date.now() - parseInt(wakeTime) > 600000) {
        doWakeup();
        sessionStorage.setItem("wake_time", Date.now().toString());
      }

      const OSS = (await import("ali-oss")).default;
      const client = new OSS({
        region: "oss-cn-shanghai",
        authorizationV4: true,
        secure: true,
        bucket,
        accessKeyId,
        accessKeySecret,
        stsToken,
        refreshSTSToken: async () => {
          try {
            const res = await fetch(config.authEndpoint);
            const { accessKeyId, accessKeySecret, stsToken } = await res.json();
            return { accessKeyId, accessKeySecret, stsToken };
          } catch {
            throw new Error("Failed to get STS");
          }
        },
        refreshSTSTokenInterval: 3600000,
      });
      setOSSClient(client);
    };
    getAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { authState, jwtToken, OSSClient };
}
