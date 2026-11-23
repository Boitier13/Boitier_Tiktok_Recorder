import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activityFromEngineEvent,
  checkCreatorNow,
  clearArchiveCache,
  moveRecordingToPending,
  openActiveRecordingFolder,
  openRecordingFolder,
  planRecordingRemoval,
  readLibraryPending,
  readLibrarySummary,
  readEngineSettings,
  readWindowsStartup,
  readSnapshot,
  saveEngineSetting,
  sendTestWindowsNotification,
  setWindowsStartup,
  recordingMediaUrl,
  restoreLibraryBatch,
  stopRecording,
} from "@/lib/backend";

beforeEach(() => clearArchiveCache());
afterEach(() => vi.unstubAllGlobals());

describe("adaptateur d’état moteur BTL", () => {
  it("garde une erreur de vérification distincte du statut hors ligne", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const payload = url.endsWith("/api/state")
          ? {
              app: { mode: "headless" },
              session: { running: true, monitoring_active: true },
              channels: [
                { name: "tiktok:live_user", enabled: true, live: false, last_error: "HTTP 503" },
                { name: "tiktok:checking_user", enabled: true, live: false, status: "Checking..." },
                { name: "tiktok:offline_user", enabled: true, live: false, status: "Offline" },
                { name: "tiktok:live_user2", enabled: true, live: true, recording: true },
              ],
            }
          : { recordings: [] };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const state = await readSnapshot();
    expect(state.creators.map((creator) => creator.status)).toEqual([
      "unknown",
      "unknown",
      "offline",
      "live",
    ]);
    expect(state.monitoringActive).toBe(true);
  });

  it("garde les captures actives quand la détection est en pause", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const payload = url.endsWith("/api/state")
          ? {
              session: { running: true, monitoring_active: false },
              channels: [{ name: "tiktok:demo", enabled: true, live: true, recording: true }],
            }
          : { recordings: [] };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const state = await readSnapshot();
    expect(state.monitoringActive).toBe(false);
    expect(state.activeRecordings).toHaveLength(1);
    expect(state.activeRecordings[0]?.creator.username).toBe("demo");
  });

  it("utilise les chemins et métadonnées réels des enregistrements reçus", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const payload = url.endsWith("/api/state")
          ? { session: { running: false }, channels: [] }
          : {
              recordings: [
                {
                  path: "C:\\Videos\\tiktok\\demo\\2026-11-21\\live.mp4",
                  channel: "tiktok:demo",
                  size: 2_097_152,
                  duration_seconds: 120,
                  finished_at: "2026-11-21T12:00:00Z",
                  remux_ok: true,
                },
              ],
            };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const state = await readSnapshot();
    expect(state.recordings).toHaveLength(1);
    expect(state.recordings[0]).toMatchObject({
      creator: "demo",
      fileName: "live.mp4",
      path: "C:\\Videos\\tiktok\\demo\\2026-11-21\\live.mp4",
      durationSec: 120,
      sizeMB: 2,
      state: "complete",
    });
  });

  it("relaie l’arrêt d’une capture au contrôle du moteur", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await stopRecording("tiktok:demo");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/recording/stop",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ channel: "tiktok:demo" }) }),
    );
  });

  it("construit une URL locale encodée pour lire le média archivé", () => {
    expect(recordingMediaUrl("C:\\Vidéos\\Live test.mp4")).toBe(
      "/api/recordings/media?id=C%3A%5CVid%C3%A9os%5CLive%20test.mp4",
    );
  });

  it("demande une vérification immédiate via la route locale du créateur", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await checkCreatorNow("tiktok:demo name");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/creators/tiktok%3Ademo%20name/check",
      expect.objectContaining({ method: "POST", body: "{}" }),
    );
  });

  it("lit la configuration moteur persistée et enregistre un paramètre appliqué en direct", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST")
        return new Response(JSON.stringify({ value: 90, applies: "now" }), { status: 200 });
      return new Response(
        JSON.stringify({ settings: { checkIntervalSec: 180, quality: "best" } }),
        {
          status: 200,
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(readEngineSettings()).resolves.toMatchObject({
      checkIntervalSec: 180,
      quality: "best",
    });
    await expect(saveEngineSetting("checkIntervalSec", 90)).resolves.toEqual({
      value: 90,
      applies: "now",
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/settings",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ key: "checkIntervalSec", value: 90 }),
      }),
    );
  });

  it("demande au host local une notification Windows de test", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ sent: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendTestWindowsNotification()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notifications/test",
      expect.objectContaining({ method: "POST", body: "{}" }),
    );
  });

  it("lit et modifie le démarrage automatique Windows au travers du host local", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload =
        init?.method === "POST"
          ? { supported: true, enabled: true }
          : { supported: true, enabled: false };
      return new Response(JSON.stringify(payload), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(readWindowsStartup()).resolves.toEqual({ supported: true, enabled: false });
    await expect(setWindowsStartup(true)).resolves.toEqual({ supported: true, enabled: true });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/windows/startup", {
      headers: { "Content-Type": "application/json" },
      method: "POST",
      body: JSON.stringify({ enabled: true }),
    });
  });

  it("lit les statistiques et les éléments réversibles de la bibliothèque locale", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.endsWith("/api/library/summary")
        ? { summary: { recordings: { files: 3, bytes: 4096 }, channel_count: 2 } }
        : { files: 1, bytes: 1024, due_files: 0, due_bytes: 0, text: [], batches: [] };
      return new Response(JSON.stringify(payload), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(readLibrarySummary()).resolves.toMatchObject({
      recordings: { files: 3, bytes: 4096 },
      channel_count: 2,
    });
    await expect(readLibraryPending()).resolves.toMatchObject({ files: 1, bytes: 1024 });
  });

  it("demande à l’hôte local d’ouvrir le dossier parent d’un enregistrement", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ opened: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      openRecordingFolder("C:\\Videos\\tiktok\\demo\\live.mp4"),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/recordings/open-folder",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ path: "C:\\Videos\\tiktok\\demo\\live.mp4" }),
      }),
    );
  });

  it("demande l’ouverture du dossier de capture actif pour un créateur", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ opened: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(openActiveRecordingFolder("tiktok:demo")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/recordings/open-folder",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ channel: "tiktok:demo" }),
      }),
    );
  });

  it("prévisualise, déplace et restaure via les commandes réversibles du moteur", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.endsWith("plan-removal")
        ? {
            plan: { action: "pending", files: 1, bytes: 1024, summary: [], items: [], blocked: {} },
          }
        : { result: { batch: "batch-1", done: 1 } };
      return new Response(JSON.stringify(payload), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(planRecordingRemoval("/archive/live.mp4")).resolves.toMatchObject({
      action: "pending",
      files: 1,
    });
    await expect(moveRecordingToPending("/archive/live.mp4")).resolves.toMatchObject({
      batch: "batch-1",
      done: 1,
    });
    await expect(restoreLibraryBatch("batch-1")).resolves.toMatchObject({ done: 1 });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/library/move-to-pending",
      expect.objectContaining({
        body: JSON.stringify({ path: "/archive/live.mp4", confirm: true }),
      }),
    );
  });

  it("traduit les événements moteur connus et ignore ceux qui ne sont pas mappés", () => {
    expect(
      activityFromEngineEvent({ event: "live", channel: "tiktok:demo", seq: 12 }),
    ).toMatchObject({
      id: "12",
      type: "live-start",
      creator: "demo",
    });
    expect(
      activityFromEngineEvent({ event: "recording", channel: "tiktok:sabrina.13131313", seq: 13 }),
    ).toMatchObject({
      id: "13",
      type: "record-start",
      creator: "sabrina.13131313",
      text: "Enregistrement démarré",
    });
    expect(activityFromEngineEvent({ event: "future_event", channel: "tiktok:demo" })).toBeNull();
  });
});
