// Données d'exemple pour l'interface. Elles seront remplacées par les vraies données du logiciel.

export type CreatorStatus = "live" | "offline";

export type Creator = {
  id: string;
  username: string;
  displayName: string;
  status: CreatorStatus;
  enabled: boolean;
  lastLive: string;
  liveSinceSec: number;
  viewersHint?: string;
};

export type RecordingState = "complete" | "interrupted";

export type Recording = {
  id: string;
  creator: string;
  date: string; // AAAA-MM-JJ
  time: string; // HH-MM
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

export type CloseMode = "tray" | "quit";

export type Settings = {
  notificationsEnabled: boolean;
  notifyOnLiveStart: boolean;
  notifyOnRecordStart: boolean;
  notifyOnLiveEnd: boolean;
  notificationSound: boolean;
  autoRecord: boolean;
  saveFolder: string;
  checkIntervalSec: number;
  maxConcurrent: number;
  quality: "origin" | "hd" | "sd";
  format: "mp4" | "mkv";
  autoReconnect: boolean;
  startWithWindows: boolean;
  startMinimized: boolean;
  closeMode: CloseMode;
  diskLimitGB: number;
};

export const initialCreators: Creator[] = [
  { id: "c1", username: "lea.cuisine", displayName: "Léa Cuisine", status: "live", enabled: true, lastLive: "En direct", liveSinceSec: 1834 },
  { id: "c2", username: "max_gaming", displayName: "Max Gaming", status: "live", enabled: true, lastLive: "En direct", liveSinceSec: 642 },
  { id: "c3", username: "sofia.art", displayName: "Sofia Art", status: "offline", enabled: true, lastLive: "Aujourd'hui, 14:30" , liveSinceSec: 0 },
  { id: "c4", username: "julien.voyage", displayName: "Julien Voyage", status: "offline", enabled: true, lastLive: "Hier, 21:10", liveSinceSec: 0 },
  { id: "c5", username: "nina_music", displayName: "Nina Music", status: "live", enabled: false, lastLive: "En direct", liveSinceSec: 300 },
  { id: "c6", username: "tom.bricolage", displayName: "Tom Bricolage", status: "offline", enabled: true, lastLive: "18 nov., 19:45", liveSinceSec: 0 },
  { id: "c7", username: "clara.mode", displayName: "Clara Mode", status: "offline", enabled: false, lastLive: "12 nov., 08:15", liveSinceSec: 0 },
  { id: "c8", username: "hugo.science", displayName: "Hugo Science", status: "offline", enabled: true, lastLive: "Jamais vu en direct", liveSinceSec: 0 },
];

export const initialRecordings: Recording[] = [
  { id: "r1", creator: "sofia.art", date: "2026-11-20", time: "14-30", durationSec: 3920, sizeMB: 1420, state: "complete" },
  { id: "r2", creator: "lea.cuisine", date: "2026-11-20", time: "11-05", durationSec: 2710, sizeMB: 980, state: "complete" },
  { id: "r3", creator: "max_gaming", date: "2026-11-20", time: "09-12", durationSec: 5400, sizeMB: 2310, state: "interrupted" },
  { id: "r4", creator: "julien.voyage", date: "2026-11-19", time: "21-10", durationSec: 4210, sizeMB: 1630, state: "complete" },
  { id: "r5", creator: "lea.cuisine", date: "2026-11-19", time: "19-45", durationSec: 3300, sizeMB: 1190, state: "complete" },
  { id: "r6", creator: "tom.bricolage", date: "2026-11-18", time: "19-45", durationSec: 1980, sizeMB: 720, state: "complete" },
  { id: "r7", creator: "max_gaming", date: "2026-11-18", time: "22-30", durationSec: 7200, sizeMB: 3050, state: "complete" },
  { id: "r8", creator: "clara.mode", date: "2026-11-12", time: "08-15", durationSec: 1500, sizeMB: 540, state: "complete" },
];

export const initialActivity: ActivityEvent[] = [
  { id: "a1", time: "21:33", type: "record-start", creator: "max_gaming", text: "Enregistrement démarré" },
  { id: "a2", time: "21:33", type: "live-start", creator: "max_gaming", text: "Live détecté" },
  { id: "a3", time: "21:13", type: "reconnect", creator: "lea.cuisine", text: "Connexion reprise après une coupure de 8 s" },
  { id: "a4", time: "21:13", type: "record-start", creator: "lea.cuisine", text: "Enregistrement démarré" },
  { id: "a5", time: "21:13", type: "live-start", creator: "lea.cuisine", text: "Live détecté" },
  { id: "a6", time: "15:35", type: "record-end", creator: "sofia.art", text: "Vidéo enregistrée : Live_14-30.mp4" },
  { id: "a7", time: "15:35", type: "live-end", creator: "sofia.art", text: "Fin du live" },
];

export const defaultSettings: Settings = {
  notificationsEnabled: true,
  notifyOnLiveStart: true,
  notifyOnRecordStart: true,
  notifyOnLiveEnd: false,
  notificationSound: true,
  autoRecord: true,
  saveFolder: "C:\\Users\\Moi\\Vidéos\\TikTok_Lives",
  checkIntervalSec: 30,
  maxConcurrent: 4,
  quality: "origin",
  format: "mp4",
  autoReconnect: true,
  startWithWindows: true,
  startMinimized: true,
  closeMode: "tray",
  diskLimitGB: 200,
};

export const DISK_TOTAL_GB = 476;
export const DISK_FREE_GB = 182;
