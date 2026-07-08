export interface FileObj {
  name: string;
  url: string;
  storageClass?: string;
}

export interface AuthState {
  state: number; // 0=authenticating, 1=success, 2=fail
  message: string;
}

export interface RoomConfig {
  /** OSS path prefix: "files" for main, "rooms/xxx" for rooms */
  prefix: string;
  /** Auth endpoint: "/auth/" or "/auth" */
  authEndpoint: string;
  /** Room name for FC requests (undefined = main mode) */
  room?: string;
  /** Page title */
  title: string;
  /** Archive expiry in days: 7 for main, 14 for rooms */
  archiveDays: number;
  /** Whether to enable POST /zip endpoint + daily pre-built zip download */
  enableZipEndpoint: boolean;
}
