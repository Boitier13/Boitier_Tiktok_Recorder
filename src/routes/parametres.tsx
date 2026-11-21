import { createFileRoute } from "@tanstack/react-router";
import { Bell, Download, FolderOpen, HardDrive, MonitorCog, Radar, Upload, Video } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useAppStore } from "@/lib/app-store";
import { formatSize } from "@/lib/format";
import { DISK_FREE_GB, DISK_TOTAL_GB, type Settings } from "@/lib/mock-data";

export const Route = createFileRoute("/parametres")({
  head: () => ({
    meta: [
      { title: "Paramètres — Radar LIVE" },
      { name: "description", content: "Réglez les notifications, l'enregistrement, le stockage et le fonctionnement en arrière-plan." },
      { property: "og:title", content: "Paramètres — Radar LIVE" },
      { property: "og:description", content: "Réglez les notifications, l'enregistrement, le stockage et le fonctionnement en arrière-plan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function Section({ icon: Icon, title, children }: { icon: typeof Bell; title: string; children: ReactNode }) {
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

function SettingsPage() {
  const { settings, updateSettings, recordings } = useAppStore();
  const set = <K extends keyof Settings>(key: K) => (value: Settings[K]) => updateSettings({ [key]: value } as Partial<Settings>);
  const usedGB = recordings.reduce((s, r) => s + r.sizeMB, 0) / 1024;
  const usedPct = Math.min(100, (usedGB / settings.diskLimitGB) * 100);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Paramètres" subtitle="Les réglages sont enregistrés automatiquement." />

      <Section icon={Bell} title="Notifications">
        <Row label="Notifications Windows" hint="Être averti quand un créateur passe en direct.">
          <Switch checked={settings.notificationsEnabled} onCheckedChange={set("notificationsEnabled")} aria-label="Notifications Windows" />
        </Row>
        <Row label="Début d'un live">
          <Switch disabled={!settings.notificationsEnabled} checked={settings.notifyOnLiveStart} onCheckedChange={set("notifyOnLiveStart")} aria-label="Début d'un live" />
        </Row>
        <Row label="Début de l'enregistrement">
          <Switch disabled={!settings.notificationsEnabled} checked={settings.notifyOnRecordStart} onCheckedChange={set("notifyOnRecordStart")} aria-label="Début de l'enregistrement" />
        </Row>
        <Row label="Fin d'un live" hint="Avec un bouton pour ouvrir le dossier de la vidéo.">
          <Switch disabled={!settings.notificationsEnabled} checked={settings.notifyOnLiveEnd} onCheckedChange={set("notifyOnLiveEnd")} aria-label="Fin d'un live" />
        </Row>
        <Row label="Son de notification">
          <Switch disabled={!settings.notificationsEnabled} checked={settings.notificationSound} onCheckedChange={set("notificationSound")} aria-label="Son de notification" />
        </Row>
      </Section>

      <Section icon={Radar} title="Surveillance">
        <Row label="Fréquence de vérification" hint="Plus c'est fréquent, plus un live est détecté tôt.">
          <div className="flex w-64 items-center gap-3">
            <Slider
              min={15}
              max={300}
              step={15}
              value={[settings.checkIntervalSec]}
              onValueChange={(v) => updateSettings({ checkIntervalSec: v[0] ?? 30 })}
              aria-label="Fréquence de vérification"
            />
            <span className="w-16 text-right font-mono text-sm">
              {settings.checkIntervalSec < 60 ? `${settings.checkIntervalSec} s` : `${(settings.checkIntervalSec / 60).toString().replace(".", ",")} min`}
            </span>
          </div>
        </Row>
      </Section>

      <Section icon={Video} title="Enregistrement">
        <Row label="Enregistrer automatiquement" hint="Démarre dès qu'un live est détecté.">
          <Switch checked={settings.autoRecord} onCheckedChange={set("autoRecord")} aria-label="Enregistrer automatiquement" />
        </Row>
        <Row label="Enregistrements simultanés maximum">
          <Select value={String(settings.maxConcurrent)} onValueChange={(v) => updateSettings({ maxConcurrent: Number(v) })}>
            <SelectTrigger className="w-40" aria-label="Enregistrements simultanés"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 6, 8, 10].map((n) => (
                <SelectItem key={n} value={String(n)}>{n} à la fois</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Qualité vidéo" hint="Selon ce que propose le live.">
          <Select value={settings.quality} onValueChange={(v) => set("quality")(v as Settings["quality"])}>
            <SelectTrigger className="w-40" aria-label="Qualité vidéo"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="origin">Originale</SelectItem>
              <SelectItem value="hd">HD (720p)</SelectItem>
              <SelectItem value="sd">Économie (480p)</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row label="Format du fichier">
          <Select value={settings.format} onValueChange={(v) => set("format")(v as Settings["format"])}>
            <SelectTrigger className="w-40" aria-label="Format du fichier"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mp4">MP4 (recommandé)</SelectItem>
              <SelectItem value="mkv">MKV</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row label="Reprendre après une coupure" hint="Relance l'enregistrement si la connexion est interrompue.">
          <Switch checked={settings.autoReconnect} onCheckedChange={set("autoReconnect")} aria-label="Reprendre après une coupure" />
        </Row>
      </Section>

      <Section icon={HardDrive} title="Stockage">
        <div className="space-y-3 p-4">
          <p className="text-sm font-medium">Dossier de sauvegarde</p>
          <div className="flex gap-2">
            <Input value={settings.saveFolder} onChange={(e) => updateSettings({ saveFolder: e.target.value })} className="font-mono text-xs" />
            <Button variant="secondary" onClick={() => toast("Choisir un dossier", { description: "Disponible dans la version Windows." })}>
              <FolderOpen /> Parcourir
            </Button>
          </div>
          <p className="font-mono text-xs text-muted-foreground">Classement : Créateur \ AAAA-MM-JJ \ Live_HH-MM.mp4</p>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">Espace utilisé par les vidéos</span>
            <span className="font-mono text-xs text-muted-foreground">
              {formatSize(usedGB * 1024)} / {settings.diskLimitGB} Go
            </span>
          </div>
          <Progress value={usedPct} aria-label="Espace utilisé" />
          <p className="text-xs text-muted-foreground">
            Disque : {DISK_FREE_GB} Go libres sur {DISK_TOTAL_GB} Go
          </p>
        </div>
        <Row label="Limite d'espace pour les vidéos" hint="Vous serez averti à l'approche de la limite.">
          <Select value={String(settings.diskLimitGB)} onValueChange={(v) => updateSettings({ diskLimitGB: Number(v) })}>
            <SelectTrigger className="w-40" aria-label="Limite d'espace"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[50, 100, 200, 300, 400].map((n) => (
                <SelectItem key={n} value={String(n)}>{n} Go</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </Section>

      <Section icon={MonitorCog} title="Windows et arrière-plan">
        <Row label="Lancer avec Windows">
          <Switch checked={settings.startWithWindows} onCheckedChange={set("startWithWindows")} aria-label="Lancer avec Windows" />
        </Row>
        <Row label="Démarrer réduit dans la zone de notification">
          <Switch checked={settings.startMinimized} onCheckedChange={set("startMinimized")} aria-label="Démarrer réduit" />
        </Row>
        <div className="space-y-3 p-4">
          <p className="text-sm font-medium">Quand je ferme la fenêtre</p>
          <RadioGroup value={settings.closeMode} onValueChange={(v) => set("closeMode")(v as Settings["closeMode"])} className="gap-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-radar">
              <RadioGroupItem value="tray" className="mt-0.5" />
              <span>
                <span className="block text-sm">Continuer en arrière-plan</span>
                <span className="block text-xs text-muted-foreground">La surveillance continue depuis la zone de notification.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-radar">
              <RadioGroupItem value="quit" className="mt-0.5" />
              <span>
                <span className="block text-sm">Quitter complètement</span>
                <span className="block text-xs text-muted-foreground">Les enregistrements en cours sont finalisés avant de quitter.</span>
              </span>
            </label>
          </RadioGroup>
        </div>
      </Section>

      <Section icon={Download} title="Sauvegarde">
        <Row label="Liste des créateurs et paramètres" hint="Pour changer de PC ou restaurer votre configuration.">
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => toast("Sauvegarde", { description: "Disponible dans la version Windows." })}>
              <Download /> Sauvegarder
            </Button>
            <Button variant="ghost" size="sm" onClick={() => toast("Restauration", { description: "Disponible dans la version Windows." })}>
              <Upload /> Restaurer
            </Button>
          </div>
        </Row>
      </Section>
    </div>
  );
}
