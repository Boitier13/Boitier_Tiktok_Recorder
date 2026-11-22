export type CreatorStatus = "live" | "offline" | "unknown";

export type Creator = {
  id: string;
  username: string;
  displayName: string;
  status: CreatorStatus;
  enabled: boolean;
  lastLive: string;
  detail?: string;
  liveSinceSec: number;
  viewersHint?: string;
};

export type RecordingState = "complete" | "interrupted";

export type Recording = {
  id: string;
  creator: string;
  path?: string;
  fileName?: string;
  date: string;
  time: string;
  durationSec: number;
  sizeMB: number;
  state: RecordingState;
};

export type ActivityType = "live-start" | "live-end" | "record-start" | "record-end" | "reconnect";

export type ActivityEvent = {
  id: string;
  time: string;
  type: ActivityType;
  creator: string;
  text: string;
};

export type Settings = {
  notificationsEnabled: boolean;
  saveFolder: string;
  checkIntervalSec: number;
  quality: string;
  filenamePattern: string;
  splitOnResolutionChange: boolean;
  maxRecordHours: number;
  maxFileSizeGB: number;
  minDiskSpaceGB: number;
  reconnectGraceMinutes: number;
  reconnectExtendedMinutes: number;
};

// Safe startup values while the persisted engine configuration is loading.
export const draftSettings: Settings = {
  notificationsEnabled: true,
  saveFolder: "",
  checkIntervalSec: 180,
  quality: "best",
  filenamePattern: "{username}_{timestamp}",
  splitOnResolutionChange: true,
  maxRecordHours: 12,
  maxFileSizeGB: 8,
  minDiskSpaceGB: 5,
  reconnectGraceMinutes: 3,
  reconnectExtendedMinutes: 10,
};
