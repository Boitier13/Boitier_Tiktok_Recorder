import type { ActivityEvent, ActivityType, Creator, Recording, Settings } from "./models";

export type EngineSnapshot = {
  app?: { mode?: string; version?: string };
  session?: { running?: boolean; monitoring_active?: boolean; recording?: number };
  channels?: Array<Record<string, unknown>>;
  health?: { problems?: string[]; disk?: { main?: { free_gb?: number } } };
  updated_at?: number;
};

let archiveCache: Recording[] | null = null;
let archiveCacheAt = 0;
const ARCHIVE_CACHE_MS = 2_000;

export function clearArchiveCache() {
  archiveCache = null;
  archiveCacheAt = 0;
}

export type LibrarySummary = {
  scanned_at?: string;
  scan_seconds?: number;
  complete?: boolean;
  recordings?: { bytes?: number; files?: number };
  totals?: Record<string, { bytes?: number; files?: number }>;
  channel_count?: number;
  notes?: { partial_files?: number; unreadable_folders?: number; links_skipped?: number };
};

export type LibraryRecordingInfo = {
  path: string;
  file: string;
  date: string;
  length_seconds: number | null;
  length: string;
  title: string;
  size: number;
  raw: boolean;
  clip_count: number;
  clips: Array<{ path: string; file: string; size: number; saved_at: string }>;
};

export type LibraryBatch = { batch: string; files: number; bytes: number; time: number };

export type LibraryPending = {
  files: number;
  bytes: number;
  due_files: number;
  due_bytes: number;
  text: string[];
  batches: LibraryBatch[];
};

export type LibraryPlan = {
  action: string;
  label: string;
  files: number;
  bytes: number;
  summary: string[];
  items: Array<{ path: string; size: number; kind: string; channel: string; role: string }>;
  blocked: Record<string, string>;
  skipped_count: number;
};

export type BtlSnapshot = {
  engine: EngineSnapshot;
  creators: Creator[];
  recordings: Recording[];
  activeRecordings: Array<{
    creator: Creator;
    elapsedSec: number;
    sizeMB: number;
    fileName: string;
  }>;
  diskFreeGB: number | null;
  monitoringActive: boolean;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string" ? payload.error : `Erreur HTTP ${response.status}`,
    );
  }
  return payload as T;
}

function parseDuration(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value) return 0;
  const parts = value.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseHumanSizeMB(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value / (1024 * 1024);
  const match = asText(value)
    .trim()
    .match(/^([\d.]+)\s*(B|KB|MB|GB)$/i);
  if (!match) return 0;
  const amountText = match[1];
  const unitText = match[2];
  if (!amountText || !unitText) return 0;
  const amount = Number(amountText);
  const unit = unitText.toUpperCase();
  const factors: Record<string, number> = { B: 1 / (1024 * 1024), KB: 1 / 1024, MB: 1, GB: 1024 };
  return amount * (factors[unit] ?? 0);
}

function mapCreator(row: Record<string, unknown>): Creator {
  const channel = asText(row["name"]);
  const username = channel.replace(/^tiktok:/i, "").replace(/^@/, "");
  const live = row["live"] === true || row["recording"] === true;
  const enabled = row["enabled"] !== false;
  const rawStatus = asText(row["status"]).toLowerCase();
  const error =
    asText(row["last_error"]) ||
    asText(row["error"]) ||
    (rawStatus.includes("error") || rawStatus.includes("fail") || rawStatus.includes("checking")
      ? rawStatus
      : "");
  const confirmedOffline = rawStatus === "off" || rawStatus.startsWith("offline");
  const lastLive = asText(row["last_live"]);
  return {
    id: channel,
    username,
    displayName: username,
    status: live ? "live" : error || !confirmedOffline ? "unknown" : "offline",
    enabled,
    lastLive:
      lastLive || (error ? "État inconnu — erreur de vérification" : "Aucune donnée sur les directs"),
    detail: asText(row["detail"]),
    liveSinceSec: parseDuration(row["duration"]),
  };
}

function mapRecording(row: Record<string, unknown>, index: number): Recording | null {
  const path = asText(row["path"]);
  const channel = asText(row["channel"]);
  const finishedAt = asText(row["finished_at"]);
  if (!path || !channel) return null;
  const creator = channel.replace(/^tiktok:/i, "").replace(/^@/, "");
  const timestamp = finishedAt ? new Date(finishedAt) : new Date(0);
  const date = Number.isNaN(timestamp.getTime()) ? "" : timestamp.toISOString().slice(0, 10);
  const time = Number.isNaN(timestamp.getTime())
    ? "00-00"
    : `${String(timestamp.getHours()).padStart(2, "0")}-${String(timestamp.getMinutes()).padStart(2, "0")}`;
  const bytes = typeof row["size"] === "number" ? row["size"] : Number(row["size"]) || 0;
  return {
    id: path || `${channel}-${index}`,
    creator,
    path,
    fileName: path.split(/[\\/]/).pop() || "Enregistrement",
    date,
    time,
    durationSec: typeof row["duration_seconds"] === "number" ? row["duration_seconds"] : 0,
    sizeMB: bytes / (1024 * 1024),
    state: row["remux_ok"] === false ? "interrupted" : "complete",
  };
}

async function readArchive(): Promise<Recording[]> {
  if (archiveCache && Date.now() - archiveCacheAt < ARCHIVE_CACHE_MS) return archiveCache;
  const archive = await request<{ recordings?: Array<Record<string, unknown>> }>("/api/recordings");
  archiveCache = (archive.recordings ?? [])
    .map(mapRecording)
    .filter((recording): recording is Recording => recording !== null);
  archiveCacheAt = Date.now();
  return archiveCache;
}

export async function readLibrarySummary(): Promise<LibrarySummary> {
  const result = await request<{ summary?: LibrarySummary }>("/api/library/summary");
  return result.summary ?? {};
}

export async function readLibraryChannel(channel: string): Promise<LibraryRecordingInfo[]> {
  const query = new URLSearchParams({ channel, sort: "date", order: "desc", limit: "20000" });
  const result = await request<{ recordings?: LibraryRecordingInfo[] }>(
    `/api/library/channel?${query.toString()}`,
  );
  return result.recordings ?? [];
}

export async function readLibraryPending(): Promise<LibraryPending> {
  return request<LibraryPending>("/api/library/pending");
}

export async function openRecordingFolder(path?: string): Promise<void> {
  await request<{ opened: true }>("/api/recordings/open-folder", {
    method: "POST",
    body: JSON.stringify(path ? { path } : {}),
  });
}

export async function openActiveRecordingFolder(channel: string): Promise<void> {
  await request<{ opened: true }>("/api/recordings/open-folder", {
    method: "POST",
    body: JSON.stringify({ channel }),
  });
}

export async function planRecordingRemoval(path: string): Promise<LibraryPlan> {
  const result = await request<{ plan: LibraryPlan }>("/api/library/plan-removal", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
  return result.plan;
}

export async function moveRecordingToPending(
  path: string,
): Promise<{ batch: string; done: number }> {
  const result = await request<{ result: { batch: string; done: number } }>(
    "/api/library/move-to-pending",
    { method: "POST", body: JSON.stringify({ path, confirm: true }) },
  );
  clearArchiveCache();
  return result.result;
}

export async function restoreLibraryBatch(batch: string): Promise<{ done: number }> {
  const result = await request<{ result: { done: number } }>("/api/library/restore", {
    method: "POST",
    body: JSON.stringify({ batch, confirm: true }),
  });
  clearArchiveCache();
  return result.result;
}

export type WindowsStartupState = { supported: boolean; enabled: boolean };

export async function readWindowsStartup(): Promise<WindowsStartupState> {
  return request<WindowsStartupState>("/api/windows/startup");
}

export async function setWindowsStartup(enabled: boolean): Promise<WindowsStartupState> {
  return request<WindowsStartupState>("/api/windows/startup", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

export async function sendTestWindowsNotification(): Promise<void> {
  await request<{ sent: true }>("/api/notifications/test", {
    method: "POST",
    body: "{}",
  });
}

export async function readEngineSettings(): Promise<Settings> {
  const result = await request<{ settings: Settings }>("/api/settings");
  return result.settings;
}

export async function saveEngineSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
): Promise<{ value: Settings[K]; applies: string }> {
  return request<{ value: Settings[K]; applies: string }>("/api/settings", {
    method: "POST",
    body: JSON.stringify({ key, value }),
  });
}

export async function readSnapshot(): Promise<BtlSnapshot> {
  const [engine, recordings] = await Promise.all([
    request<EngineSnapshot>("/api/state"),
    readArchive(),
  ]);
  const creators = (engine.channels ?? []).map(mapCreator);
  const activeRecordings = (engine.channels ?? [])
    .filter((row) => row["recording"] === true)
    .map((row) => {
      const creator = mapCreator(row);
      return {
        creator,
        elapsedSec: parseDuration(row["duration"]),
        sizeMB: parseHumanSizeMB(row["size"]),
        fileName: asText(row["file"]) || "Enregistrement en cours",
      };
    });
  const free = engine.health?.disk?.main?.free_gb;
  return {
    engine,
    creators,
    recordings,
    activeRecordings,
    diskFreeGB: typeof free === "number" ? free : null,
    monitoringActive:
      typeof engine.session?.monitoring_active === "boolean"
        ? engine.session.monitoring_active
        : engine.session?.running === true,
  };
}

export async function createCreator(username: string): Promise<void> {
  await request("/api/creators", {
    method: "POST",
    body: JSON.stringify({ username, enabled: true }),
  });
}

export async function setCreatorEnabled(id: string, enabled: boolean): Promise<void> {
  await request(`/api/creators/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export async function checkCreatorNow(id: string): Promise<void> {
  await request(`/api/creators/${encodeURIComponent(id)}/check`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function removeCreator(id: string): Promise<void> {
  await request(`/api/creators/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function setMonitoring(running: boolean): Promise<void> {
  await request("/api/session", { method: "POST", body: JSON.stringify({ running }) });
}

export async function stopRecording(id: string): Promise<void> {
  await request("/api/recording/stop", { method: "POST", body: JSON.stringify({ channel: id }) });
  clearArchiveCache();
}

export function recordingMediaUrl(id: string): string {
  return `/api/recordings/media?id=${encodeURIComponent(id)}`;
}

export function activityFromEngineEvent(payload: Record<string, unknown>): ActivityEvent | null {
  const event = asText(payload["event"]);
  const channel = asText(payload["channel"])
    .replace(/^tiktok:/i, "")
    .replace(/^@/, "");
  const types: Record<string, ActivityType> = {
    live: "live-start",
    offline: "live-end",
    recording: "record-start",
    finished: "record-end",
    reconnect: "reconnect",
  };
  const type = types[event];
  if (!type) return null;
  const date = new Date();
  const textByEvent: Record<string, string> = {
    live: "LIVE détecté par le moteur",
    recording: "Enregistrement démarré",
    offline: "LIVE terminé — enregistrement finalisé",
    finished: "Enregistrement terminé",
    reconnect: "Reconnexion au LIVE",
  };
  return {
    id: String(payload["seq"] ?? `${date.getTime()}-${event}-${channel}`),
    time: date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    type,
    creator: channel,
    text: textByEvent[event] ?? event,
  };
}
