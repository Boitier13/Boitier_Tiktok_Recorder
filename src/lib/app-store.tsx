import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  defaultSettings,
  initialActivity,
  initialCreators,
  initialRecordings,
  type ActivityEvent,
  type Creator,
  type Recording,
  type Settings,
} from "./mock-data";
import { isValidUsername, normalizeUsername } from "./format";

export type ActiveRecording = {
  creator: Creator;
  elapsedSec: number;
  sizeMB: number;
  fileName: string;
};

type Store = {
  creators: Creator[];
  recordings: Recording[];
  activity: ActivityEvent[];
  settings: Settings;
  monitoringActive: boolean;
  nextCheckIn: number;
  activeRecordings: ActiveRecording[];
  setMonitoringActive: (v: boolean) => void;
  addCreator: (raw: string) => string | null;
  removeCreator: (id: string) => void;
  toggleCreator: (id: string) => void;
  stopRecording: (creatorId: string) => void;
  deleteRecording: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
};

const AppStoreContext = createContext<Store | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [creators, setCreators] = useState<Creator[]>(initialCreators);
  const [recordings, setRecordings] = useState<Recording[]>(initialRecordings);
  const [activity] = useState<ActivityEvent[]>(initialActivity);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [monitoringActive, setMonitoringActive] = useState(true);
  const [stopped, setStopped] = useState<string[]>([]);
  const [tick, setTick] = useState(0);

  // Horloge locale uniquement après affichage, pour animer les durées.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const addCreator = useCallback(
    (raw: string) => {
      const username = normalizeUsername(raw);
      if (!username) return "Saisissez un nom d'utilisateur TikTok.";
      if (!isValidUsername(username)) return "Ce nom d'utilisateur ne semble pas valide.";
      if (creators.some((c) => c.username === username)) return "Ce créateur est déjà dans votre liste.";
      setCreators((prev) => [
        {
          id: `c${Date.now()}`,
          username,
          displayName: username,
          status: "offline",
          enabled: true,
          lastLive: "Vérification en cours…",
          liveSinceSec: 0,
        },
        ...prev,
      ]);
      return null;
    },
    [creators],
  );

  const value = useMemo<Store>(() => {
    const activeRecordings: ActiveRecording[] = settings.autoRecord && monitoringActive
      ? creators
          .filter((c) => c.status === "live" && c.enabled && !stopped.includes(c.id))
          .slice(0, settings.maxConcurrent)
          .map((c) => {
            const elapsedSec = c.liveSinceSec + tick;
            return { creator: c, elapsedSec, sizeMB: elapsedSec * 0.38, fileName: "Live_21-13.mp4" };
          })
      : [];

    return {
      creators,
      recordings,
      activity,
      settings,
      monitoringActive,
      nextCheckIn: settings.checkIntervalSec - (tick % settings.checkIntervalSec),
      activeRecordings,
      setMonitoringActive,
      addCreator,
      removeCreator: (id) => setCreators((prev) => prev.filter((c) => c.id !== id)),
      toggleCreator: (id) =>
        setCreators((prev) => prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c))),
      stopRecording: (creatorId) => setStopped((prev) => [...prev, creatorId]),
      deleteRecording: (id) => setRecordings((prev) => prev.filter((r) => r.id !== id)),
      updateSettings: (patch) => setSettings((prev) => ({ ...prev, ...patch })),
    };
  }, [creators, recordings, activity, settings, monitoringActive, stopped, tick, addCreator]);

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): Store {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error("useAppStore doit être utilisé dans AppStoreProvider");
  return ctx;
}
