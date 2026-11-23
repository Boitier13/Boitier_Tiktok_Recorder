import { createFileRoute } from "@tanstack/react-router";
import { Bell, HardDrive, MonitorCog, Radar, Save, Video } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useAppStore } from "@/lib/app-store";
import {
  readWindowsStartup,
  sendTestWindowsNotification,
  setWindowsStartup,
  type WindowsStartupState,
} from "@/lib/backend";
import { formatSize } from "@/lib/format";
import type { Settings } from "@/lib/models";

const ENGINE_QUALITIES = ["best", "1080p60", "1080p", "720p60", "720p", "480p", "360p", "worst"];

export const Route = createFileRoute("/parametres")({
  head: () => ({
    meta: [
      { title: "Paramètres — Radar LIVE" },
      {
        name: "description",
        content: "Réglez les options persistées et appliquées par le moteur local.",
      },
      { property: "og:title", content: "Paramètres — Radar LIVE" },
      {
        property: "og:description",
        content: "Réglez les options persistées et appliquées par le moteur local.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Bell;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <h2 className="flex items-center gap-2 border-b p-4 text-base font-semibold">
        <Icon className="size-4 text-radar" /> {title}
      </h2>
      <div className="divide-y">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-md">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function NumberSetting({
  label,
  hint,
  value,
  unit,
  disabled,
  onSave,
}: {
  label: string;
  hint: string;
  value: number;
  unit: string;
  disabled: boolean;
  onSave: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <Row label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          step="any"
          value={draft}
          disabled={disabled}
          className="w-28 font-mono"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            const parsed = Number(draft);
            if (!Number.isFinite(parsed) || parsed < 0) {
              setDraft(String(value));
              return;
            }
            if (parsed !== value) {
              setDraft(String(value));
              onSave(parsed);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          aria-label={label}
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </Row>
  );
}

function SettingsPage() {
  const {
    settings,
    updateSetting,
    settingsLoading,
    settingsError,
    connected,
    monitoringActive,
    engine,
    diskFreeGB,
  } = useAppStore();
  const [saving, setSaving] = useState<string | null>(null);
  const [testingNotification, setTestingNotification] = useState(false);
  const [windowsStartup, setWindowsStartupState] = useState<WindowsStartupState>({
    supported: false,
    enabled: false,
  });
  const [startupLoading, setStartupLoading] = useState(true);
  const [startupSaving, setStartupSaving] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [intervalDraft, setIntervalDraft] = useState(settings.checkIntervalSec);
  const [folderDraft, setFolderDraft] = useState(settings.saveFolder);
  const [patternDraft, setPatternDraft] = useState(settings.filenamePattern);
  const disabled = !connected || settingsLoading || saving !== null;

  useEffect(() => setIntervalDraft(settings.checkIntervalSec), [settings.checkIntervalSec]);
  useEffect(() => setFolderDraft(settings.saveFolder), [settings.saveFolder]);
  useEffect(() => setPatternDraft(settings.filenamePattern), [settings.filenamePattern]);
  useEffect(() => {
    if (!connected) {
      setStartupLoading(false);
      return;
    }
    let current = true;
    setStartupLoading(true);
    readWindowsStartup()
      .then((value) => {
        if (current) {
          setWindowsStartupState(value);
          setStartupError(null);
        }
      })
      .catch((error: unknown) => {
        if (current) {
          setStartupError(
            error instanceof Error ? error.message : "État de démarrage inaccessible.",
          );
        }
      })
      .finally(() => {
        if (current) setStartupLoading(false);
      });
    return () => {
      current = false;
    };
  }, [connected]);

  const save = async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSaving(key);
    try {
      const applies = await updateSetting(key, value);
      const effect =
        key === "notificationsEnabled"
          ? "appliqué à l’interface et aux notifications Windows du moteur actif"
          : applies === "now"
            ? "en vigueur maintenant"
            : "au prochain démarrage du moteur";
      toast.success("Paramètre enregistré dans le moteur", { description: effect });
    } catch (error) {
      toast.error("Enregistrement du paramètre impossible", {
        description: error instanceof Error ? error.message : "Le moteur a refusé la modification.",
      });
    } finally {
      setSaving(null);
    }
  };

  const testWindowsNotification = async () => {
    setTestingNotification(true);
    try {
      await sendTestWindowsNotification();
      toast.success("Notification Windows envoyée");
    } catch (error) {
      toast.error("Notification Windows indisponible", {
        description:
          error instanceof Error ? error.message : "Vérifiez que l’hôte local tourne sous Windows.",
      });
    } finally {
      setTestingNotification(false);
    }
  };

  const toggleWindowsStartup = async (enabled: boolean) => {
    setStartupSaving(true);
    setStartupError(null);
    try {
      const value = await setWindowsStartup(enabled);
      setWindowsStartupState(value);
      toast.success(enabled ? "Démarrage automatique activé" : "Démarrage automatique désactivé", {
        description: enabled
          ? "BTL démarrera discrètement dans la zone de notification à l’ouverture de session."
          : "BTL ne se lancera plus automatiquement à l’ouverture de session.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Modification impossible.";
      setStartupError(message);
      toast.error("Impossible de modifier le démarrage automatique", { description: message });
    } finally {
      setStartupSaving(false);
    }
  };

  const valueDisabled = disabled;
  const sessionActive = engine?.session?.running === true;
  const pathDisabled = disabled || sessionActive;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Paramètres"
        subtitle={
          settingsLoading
            ? "Lecture de la configuration moteur…"
            : "Valeurs persistées dans la configuration moteur."
        }
      />
      {settingsError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          Impossible de lire ou d’enregistrer la configuration : {settingsError}
        </div>
      )}
      {!connected && (
        <div
          role="status"
          className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning"
        >
          Moteur local non connecté. Les paramètres ne sont pas modifiables.
        </div>
      )}

      <Section icon={Bell} title="Notifications">
        <Row
          label="Notifications Windows et interface"
          hint="Affiche les événements en toast dans l’interface ouverte et en notification système Windows tant que l’hôte et le moteur locaux fonctionnent. Windows peut bloquer les notifications selon ses réglages."
        >
          <Switch
            checked={settings.notificationsEnabled}
            disabled={valueDisabled}
            onCheckedChange={(value) => void save("notificationsEnabled", value)}
            aria-label="Notifications Windows et interface"
          />
        </Row>
        <Row
          label="Vérifier les notifications Windows"
          hint="Envoie un message de test à Windows. Cette action n’est pas disponible depuis la prévisualisation Linux."
        >
          <Button
            variant="secondary"
            disabled={disabled || testingNotification || !settings.notificationsEnabled}
            onClick={() => void testWindowsNotification()}
          >
            {testingNotification ? "Envoi…" : "Envoyer un test"}
          </Button>
        </Row>
      </Section>

      <Section icon={Radar} title="Surveillance">
        <Row
          label="Fréquence de vérification hors ligne"
          hint="Valeur du moteur : 30 secondes à 120 minutes. Elle s’applique aussi à la session en cours."
        >
          <div className="flex w-72 items-center gap-3">
            <Slider
              min={30}
              max={7200}
              step={30}
              value={[intervalDraft]}
              disabled={disabled}
              onValueChange={(values) => setIntervalDraft(values[0] ?? settings.checkIntervalSec)}
              onValueCommit={(values) => {
                const value = values[0];
                if (value !== undefined && value !== settings.checkIntervalSec) {
                  void save("checkIntervalSec", value);
                }
              }}
              aria-label="Fréquence de vérification"
            />
            <span className="w-20 text-right font-mono text-sm">
              {intervalDraft < 60
                ? `${intervalDraft} s`
                : `${(intervalDraft / 60).toString().replace(".", ",")} min`}
            </span>
          </div>
        </Row>
        <NumberSetting
          label="Reprise rapide après coupure"
          hint="Durée pendant laquelle le moteur vérifie fréquemment si le direct reprend. 0 désactive cette phase."
          value={settings.reconnectGraceMinutes}
          unit="min"
          disabled={valueDisabled}
          onSave={(value) => void save("reconnectGraceMinutes", value)}
        />
        <NumberSetting
          label="Reprise prolongée"
          hint="Phase de vérification plus espacée après la reprise rapide. 0 désactive cette phase."
          value={settings.reconnectExtendedMinutes}
          unit="min"
          disabled={valueDisabled}
          onSave={(value) => void save("reconnectExtendedMinutes", value)}
        />
      </Section>

      <Section icon={Video} title="Enregistrement">
        <Row
          label="Qualité Streamlink / yt-dlp"
          hint="Choisit une variante proposée par le flux. 360p réduit la taille si TikTok la propose; sinon cette qualité exacte peut ne pas être disponible. Les captures déjà lancées ne changent pas."
        >
          <Select
            value={settings.quality}
            disabled={valueDisabled}
            onValueChange={(value) => void save("quality", value as Settings["quality"])}
          >
            <SelectTrigger className="w-48" aria-label="Qualité vidéo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {!ENGINE_QUALITIES.includes(settings.quality) && (
                <SelectItem value={settings.quality}>
                  Valeur actuelle : {settings.quality}
                </SelectItem>
              )}
              <SelectItem value="best">Meilleure disponible</SelectItem>
              <SelectItem value="1080p60">1080p60</SelectItem>
              <SelectItem value="1080p">1080p</SelectItem>
              <SelectItem value="720p60">720p60</SelectItem>
              <SelectItem value="720p">720p</SelectItem>
              <SelectItem value="480p">480p</SelectItem>
              <SelectItem value="360p">360p · économie de disque</SelectItem>
              <SelectItem value="worst">Plus basse disponible</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row
          label="Nom des nouveaux fichiers"
          hint="Jetons moteur : {username}, {platform}, {date}, {time}, {timestamp}, {title}. Garder un horodatage pour éviter les collisions."
        >
          <div className="flex w-full gap-2 sm:w-[28rem]">
            <Input
              value={patternDraft}
              disabled={valueDisabled}
              onChange={(event) => setPatternDraft(event.target.value)}
              aria-label="Modèle de nom de fichier"
              className="font-mono text-xs"
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={
                valueDisabled || !patternDraft.trim() || patternDraft === settings.filenamePattern
              }
              onClick={() => void save("filenamePattern", patternDraft)}
            >
              Enregistrer
            </Button>
          </div>
        </Row>
        <Row
          label="Nouveau fichier si la résolution change"
          hint="Paramètre du moteur pour les prochaines captures."
        >
          <Switch
            checked={settings.splitOnResolutionChange}
            disabled={valueDisabled}
            onCheckedChange={(value) => void save("splitOnResolutionChange", value)}
            aria-label="Nouveau fichier si la résolution change"
          />
        </Row>
        <NumberSetting
          label="Durée maximale d’une partie"
          hint="0 désactive la coupure par durée. Le moteur passe automatiquement à une nouvelle partie."
          value={settings.maxRecordHours}
          unit="h"
          disabled={valueDisabled}
          onSave={(value) => void save("maxRecordHours", value)}
        />
        <NumberSetting
          label="Taille maximale d’une partie"
          hint="0 désactive la coupure par taille."
          value={settings.maxFileSizeGB}
          unit="Go"
          disabled={valueDisabled}
          onSave={(value) => void save("maxFileSizeGB", value)}
        />
      </Section>

      <Section icon={HardDrive} title="Stockage">
        <div className="space-y-3 p-4">
          <p className="text-sm font-medium">Dossier d’enregistrement</p>
          <p className="text-xs text-muted-foreground">
            Le dossier doit déjà exister. Le moteur refuse le changement pendant une session active.
          </p>
          <div className="flex gap-2">
            <Input
              value={folderDraft}
              disabled={pathDisabled}
              placeholder="Chemin existant, par exemple C:\\Videos\\Lives"
              onChange={(event) => setFolderDraft(event.target.value)}
              className="font-mono text-xs"
              aria-label="Dossier d’enregistrement"
            />
            <Button
              variant="secondary"
              disabled={pathDisabled || !folderDraft.trim() || folderDraft === settings.saveFolder}
              onClick={() => void save("saveFolder", folderDraft.trim())}
              title={
                sessionActive
                  ? "Arrêtez la session moteur avant de changer le dossier"
                  : undefined
              }
            >
              <Save /> Enregistrer
            </Button>
          </div>
        </div>
        <NumberSetting
          label="Espace libre minimal avant capture"
          hint="Le moteur attend si l’espace libre du dossier est inférieur à ce seuil. 0 désactive cette limite."
          value={settings.minDiskSpaceGB}
          unit="Go"
          disabled={valueDisabled}
          onSave={(value) => void save("minDiskSpaceGB", value)}
        />
        <Row label="Espace libre détecté">
          <span className="font-mono text-sm">
            {diskFreeGB === null ? "indisponible" : `${diskFreeGB.toFixed(1).replace(".", ",")} Go`}
          </span>
        </Row>
      </Section>

      <Section icon={MonitorCog} title="Fenêtre Windows et arrière-plan">
        <div className="space-y-2 p-4 text-sm text-muted-foreground">
          <p>
            Sous Windows, l’hôte ouvre cette interface React dans une fenêtre Microsoft Edge WebView2
            et ajoute l’icône BTL à la zone de notification. Réduire ou fermer la fenêtre la masque
            sans arrêter le moteur ; le menu de l’icône permet de la restaurer, de démarrer ou d’arrêter
            la surveillance, ou de quitter l’application.
          </p>
          <p>
            <code>--background</code> démarre directement dans la zone de notification sans fenêtre
            console ; <code>--no-desktop</code> conserve l’interface dans le navigateur. La fenêtre
            nécessite Microsoft Edge WebView2, Node.js et les dépendances de l’interface installées.
          </p>
        </div>
        <Row
          label="Démarrer automatiquement avec Windows"
          hint={
            startupError
              ? startupError
              : !connected
                ? "Connectez l’hôte local pour lire les options de démarrage."
                : startupLoading
                  ? "Lecture de l’état Windows…"
                  : !windowsStartup.supported
                    ? "Disponible uniquement lorsque l’hôte BTL tourne sous Windows."
                    : "Lance BTL discrètement dans la zone de notification à l’ouverture de session ; la surveillance reste arrêtée jusqu’à votre action."
          }
        >
          <Switch
            checked={windowsStartup.enabled}
            disabled={!connected || startupLoading || startupSaving || !windowsStartup.supported}
            onCheckedChange={(value) => void toggleWindowsStartup(value)}
            aria-label="Démarrer automatiquement avec Windows"
          />
        </Row>
      </Section>
    </div>
  );
}
