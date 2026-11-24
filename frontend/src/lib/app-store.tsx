import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  activityFromEngineEvent,
  checkCreatorNow as checkCreatorRequest,
  clearArchiveCache,
  createCreator,
  readEngineSettings,
  readSnapshot,
  removeCreator as removeCreatorRequest,
  saveEngineSetting,
  setCreatorEnabled,
  setMonitoring,
  stopRecording as stopRecordingRequest,
  type CaptureState,
  type EngineSnapshot,
} from "./backend";
import {
  draftSettings,
  type ActivityEvent,
  type Creator,
  type Recording,
  type Settings,
} from "./models";
import { isValidUsername, normalizeUsername } from "./format";

export type ActiveRecording = {
  creator: Creator;
  elapsedSec: number;
  sizeMB: number;
  fileName: string;
  noGrowthSec: number;
  stallTimeoutSec: number;
  observedAtMs: number;
};

type Store = {
  creators: Creator[];
  recordings: Recording[];
  activity: ActivityEvent[];
  settings: Settings;
  monitoringActive: boolean;
  nextCheckIn: number | null;
  activeRecordings: ActiveRecording[];
  captureStates: CaptureState[];
  engine: EngineSnapshot | null;
  connected: boolean;
  loading: boolean;
  connectionError: string | null;
  settingsLoading: boolean;
  settingsError: string | null;
  diskFreeGB: number | null;
  refresh: () => Promise<void>;
  setMonitoringActive: (v: boolean) => Promise<void>;
  addCreator: (raw: string) => Promise<string | null>;
  removeCreator: (id: string) => Promise<void>;
  toggleCreator: (id: string) => Promise<void>;
  checkCreator: (id: string) => Promise<void>;
  stopRecording: (creatorId: string) => Promise<void>;
  refreshSettings: () => Promise<void>;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<string>;
};

const AppStoreContext = createContext<Store | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [settings, setSettings] = useState<Settings>(draftSettings);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [monitoringActive, setMonitoringActiveState] = useState(false);
  const [activeRecordings, setActiveRecordings] = useState<ActiveRecording[]>([]);
  const [captureStates, setCaptureStates] = useState<CaptureState[]>([]);
  const [engine, setEngine] = useState<EngineSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [diskFreeGB, setDiskFreeGB] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const snapshot = await readSnapshot();
      setCreators(snapshot.creators);
      setRecordings(snapshot.recordings);
      setActiveRecordings(snapshot.activeRecordings);
      setCaptureStates(snapshot.captureStates);
      setMonitoringActiveState(snapshot.monitoringActive);
      setDiskFreeGB(snapshot.diskFreeGB);
      setEngine(snapshot.engine);
      setConnected(true);
      setConnectionError(null);
    } catch (error) {
      setConnected(false);
      setConnectionError(error instanceof Error ? error.message : "Moteur local indisponible.");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const persisted = await readEngineSettings();
      setSettings(persisted);
      settingsRef.current = persisted;
      setSettingsError(null);
    } catch (error) {
      setSettingsError(
        error instanceof Error ? error.message : "Configuration moteur indisponible.",
      );
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  useEffect(() => {
    void refresh();
    const poll = window.setInterval(() => void refresh(), 5000);
    const events = new EventSource("/api/events");
    events.addEventListener("engine", (message) => {
      try {
        const payload = JSON.parse((message as MessageEvent<string>).data) as Record<
          string,
          unknown
        >;
        if (payload["event"] === "finished") clearArchiveCache();
        const event = activityFromEngineEvent(payload);
        if (event) {
          setActivity((current) => [event, ...current].slice(0, 50));
          if (settingsRef.current.notificationsEnabled) {
            const who = event.creator ? ` · @${event.creator}` : "";
            if (event.type === "record-end") toast.success(`Enregistrement terminé${who}`);
            else if (event.type === "live-start") toast(`LIVE détecté${who}`);
            else if (event.type === "live-end") toast(`LIVE terminé${who}`);
            else if (event.type === "reconnect") toast.warning(`Reconnexion${who}`);
          }
        }
        void refresh();
      } catch {
        // A malformed event is ignored; the next snapshot remains authoritative.
      }
    });
    events.onerror = () => setConnected(false);
    return () => {
      window.clearInterval(poll);
      events.close();
    };
  }, [refresh]);

  const addCreator = useCallback(
    async (raw: string): Promise<string | null> => {
      const username = normalizeUsername(raw);
      if (!username) return "Saisissez un nom d'utilisateur TikTok.";
      if (!isValidUsername(username)) return "Ce nom d'utilisateur ne semble pas valide.";
      if (creators.some((creator) => creator.username.toLowerCase() === username.toLowerCase())) {
        return "Ce créateur est déjà dans votre liste.";
      }
      try {
        await createCreator(username);
        await refresh();
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : "Impossible d’ajouter ce créateur.";
      }
    },
    [creators, refresh],
  );

  const removeCreator = useCallback(
    async (id: string) => {
      await removeCreatorRequest(id);
      await refresh();
    },
    [refresh],
  );

  const toggleCreator = useCallback(
    async (id: string) => {
      const creator = creators.find((row) => row.id === id);
      if (!creator) throw new Error("Créateur absent de l’état moteur.");
      await setCreatorEnabled(id, !creator.enabled);
      await refresh();
    },
    [creators, refresh],
  );

  const checkCreator = useCallback(
    async (id: string) => {
      await checkCreatorRequest(id);
      await refresh();
    },
    [refresh],
  );

  const setMonitoringActive = useCallback(
    async (running: boolean) => {
      await setMonitoring(running);
      await refresh();
    },
    [refresh],
  );

  const stopRecording = useCallback(
    async (id: string) => {
      await stopRecordingRequest(id);
      await refresh();
    },
    [refresh],
  );

  const updateSetting = useCallback(
    async <K extends keyof Settings>(key: K, value: Settings[K]): Promise<string> => {
      try {
        const result = await saveEngineSetting(key, value);
        setSettings((current) => {
          const next = { ...current, [key]: result.value };
          settingsRef.current = next;
          return next;
        });
        setSettingsError(null);
        return result.applies;
      } catch (error) {
        await refreshSettings();
        throw error;
      }
    },
    [refreshSettings],
  );

  const value = useMemo<Store>(
    () => ({
      creators,
      recordings,
      activity,
      settings,
      monitoringActive,
      nextCheckIn: null,
      activeRecordings,
      captureStates,
      engine,
      connected,
      loading,
      connectionError,
      settingsLoading,
      settingsError,
      diskFreeGB,
      refresh,
      refreshSettings,
      setMonitoringActive,
      addCreator,
      removeCreator,
      toggleCreator,
      checkCreator,
      stopRecording,
      updateSetting,
    }),
    [
      creators,
      recordings,
      activity,
      settings,
      monitoringActive,
      activeRecordings,
      captureStates,
      engine,
      connected,
      loading,
      connectionError,
      settingsLoading,
      settingsError,
      diskFreeGB,
      refresh,
      refreshSettings,
      setMonitoringActive,
      addCreator,
      removeCreator,
      toggleCreator,
      checkCreator,
      stopRecording,
      updateSetting,
    ],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): Store {
  const context = useContext(AppStoreContext);
  if (!context) throw new Error("useAppStore doit être utilisé dans AppStoreProvider");
  return context;
}
