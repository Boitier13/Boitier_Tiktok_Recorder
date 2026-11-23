import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  CircleStop,
  FolderOpen,
  HardDrive,
  Pause,
  Play,
  Radio,
  Users,
  Video,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { CreatorAvatar } from "@/components/creator-avatar";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/app-store";
import { openActiveRecordingFolder } from "@/lib/backend";
import { formatDuration, formatSize } from "@/lib/format";
import type { ActivityType } from "@/lib/models";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Surveillance — Radar LIVE" },
      {
        name: "description",
        content:
          "Vos créateurs TikTok en direct et les enregistrements en cours, en un coup d'œil.",
      },
      { property: "og:title", content: "Surveillance — Radar LIVE" },
      {
        property: "og:description",
        content:
          "Vos créateurs TikTok en direct et les enregistrements en cours, en un coup d'œil.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SurveillancePage,
});

const activityIcon: Record<ActivityType, { icon: typeof Radio; className: string }> = {
  "live-start": { icon: Radio, className: "text-live bg-live/15" },
  "live-end": { icon: CircleStop, className: "text-muted-foreground bg-muted" },
  "record-start": { icon: Video, className: "text-radar bg-radar/15" },
  "record-end": { icon: Video, className: "text-success bg-success/15" },
  reconnect: { icon: Wifi, className: "text-warning bg-warning/15" },
};

function SurveillancePage() {
  const {
    creators,
    activeRecordings,
    activity,
    monitoringActive,
    setMonitoringActive,
    stopRecording,
    recordings,
    nextCheckIn,
    connected,
    connectionError,
    diskFreeGB,
  } = useAppStore();
  const watched = creators.filter((c) => c.enabled);
  const live = watched.filter((c) => c.status === "live");
  const usedMB =
    recordings.reduce((s, r) => s + r.sizeMB, 0) +
    activeRecordings.reduce((s, r) => s + r.sizeMB, 0);

  const stats = [
    {
      label: "Créateurs surveillés",
      value: watched.length,
      sub: `${creators.length - watched.length} en pause`,
      icon: Users,
      tone: "text-radar",
    },
    {
      label: "En direct",
      value: live.length,
      sub: "détectés maintenant",
      icon: Radio,
      tone: "text-live",
    },
    {
      label: "Enregistrements en cours",
      value: activeRecordings.length,
      sub: "en simultané",
      icon: Video,
      tone: "text-live",
    },
    {
      label: "Vidéos stockées",
      value: formatSize(usedMB),
      sub:
        diskFreeGB === null
          ? "Espace indisponible"
          : `${diskFreeGB.toFixed(1).replace(".", ",")} Go libres`,
      icon: HardDrive,
      tone: "text-success",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {!connected && (
        <div
          role="status"
          className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning"
        >
          Moteur local non connecté
          {connectionError ? ` : ${connectionError}` : ". Les actions ne sont pas disponibles."}
        </div>
      )}
      <PageHeader
        title="Surveillance"
        subtitle="La pause suspend la détection des nouveaux directs ; les captures déjà en cours continuent jusqu’à leur fin."
        actions={
          <Button
            variant={monitoringActive ? "secondary" : "default"}
            disabled={!connected}
            onClick={async () => {
              try {
                await setMonitoringActive(!monitoringActive);
                toast(
                  monitoringActive
                    ? "Détection des nouveaux directs mise en pause ; les captures en cours continuent"
                    : "Reprise de la détection des directs demandée",
                );
              } catch (error) {
                toast.error("Commande moteur refusée", {
                  description:
                    error instanceof Error ? error.message : "Vérifiez l’état du moteur.",
                });
              }
            }}
          >
            {monitoringActive ? <Pause /> : <Play />}
            {monitoringActive ? "Mettre en pause" : "Reprendre la surveillance"}
          </Button>
        }
      />

      {/* Radar + stats */}
      <section className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="panel relative flex flex-col items-center justify-center overflow-hidden p-6">
          <div className="relative size-40">
            <div className="absolute inset-0 rounded-full border border-radar/25 bg-gradient-radar" />
            <div className="absolute inset-6 rounded-full border border-radar/20" />
            <div className="absolute inset-12 rounded-full border border-radar/15" />
            {monitoringActive && (
              <div className="absolute inset-0 rounded-full bg-radar-sweep animate-radar-sweep" />
            )}
            <span className="absolute left-[28%] top-[30%] size-2.5 rounded-full bg-live animate-live-pulse" />
            <span className="absolute right-[24%] top-[58%] size-2.5 rounded-full bg-live animate-live-pulse" />
            <span className="absolute left-[46%] bottom-[18%] size-1.5 rounded-full bg-muted-foreground/60" />
            <span className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-radar" />
          </div>
          <p className="mt-5 font-display text-sm font-semibold text-foreground">
            {monitoringActive ? "Radar actif" : "Radar en pause"}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {monitoringActive
              ? nextCheckIn === null
                ? "détection active"
                : `prochaine vérification · ${nextCheckIn} s`
              : "détection en pause · captures en cours conservées"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="panel flex flex-col justify-between p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{s.label}</span>
                <s.icon className={cn("size-4", s.tone)} />
              </div>
              <div className="mt-4">
                <p className="font-display text-3xl font-semibold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Enregistrements en cours */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <span className="size-2 rounded-full bg-live animate-live-pulse" /> Enregistrements en
          cours
        </h2>
        {activeRecordings.length === 0 ? (
          <div className="panel p-8 text-center text-sm text-muted-foreground">
            Aucun enregistrement en cours signalé par le moteur.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {activeRecordings.map((r) => (
              <article key={r.creator.id} className="panel glow-live overflow-hidden">
                <div className="relative flex aspect-[16/7] items-end bg-gradient-video p-4">
                  <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-md bg-gradient-live px-2 py-1 text-xs font-bold uppercase tracking-wider text-live-foreground">
                    <span className="size-1.5 rounded-full bg-live-foreground animate-live-pulse" />{" "}
                    ENR
                  </span>
                  <span className="absolute right-4 top-4 font-mono text-2xl font-medium text-foreground">
                    {formatDuration(r.elapsedSec)}
                  </span>
                  <div className="flex items-center gap-3">
                    <CreatorAvatar name={r.creator.displayName} live />
                    <div>
                      <p className="font-display font-semibold text-foreground">
                        {r.creator.displayName}
                      </p>
                      <p className="text-xs text-muted-foreground">@{r.creator.username}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="font-mono text-xs text-muted-foreground">
                    <p>{r.fileName}</p>
                    <p>{formatSize(r.sizeMB)} enregistrés</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Ouvrir le dossier de capture de ce créateur"
                      onClick={async () => {
                        try {
                          await openActiveRecordingFolder(r.creator.id);
                        } catch (error) {
                          toast.error("Ouverture du dossier impossible", {
                            description:
                              error instanceof Error
                                ? error.message
                                : "Le dossier de capture est indisponible.",
                          });
                        }
                      }}
                    >
                      <FolderOpen /> Dossier
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        try {
                          await stopRecording(r.creator.id);
                          toast.success(`Arrêt demandé pour ${r.creator.displayName}`);
                        } catch (error) {
                          toast.error("Arrêt refusé", {
                            description:
                              error instanceof Error ? error.message : "Vérifiez l’état du moteur.",
                          });
                        }
                      }}
                    >
                      <CircleStop /> Arrêter
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* Créateurs surveillés */}
        <div className="panel">
          <div className="flex items-center justify-between border-b p-4">
            <h2 className="font-semibold">Créateurs surveillés</h2>
            <Link to="/createurs" className="text-sm text-radar hover:underline">
              Gérer la liste
            </Link>
          </div>
          <ul className="divide-y">
            {[...watched]
              .sort((a, b) => (a.status === "live" ? -1 : 1) - (b.status === "live" ? -1 : 1))
              .map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <CreatorAvatar name={c.displayName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">@{c.username}</p>
                  </div>
                  <span className="hidden text-xs text-muted-foreground sm:block">
                    {c.status === "live" ? "" : c.lastLive}
                  </span>
                  <StatusPill kind={c.status} />
                </li>
              ))}
          </ul>
        </div>

        {/* Journal */}
        <div className="panel">
          <div className="flex items-center gap-2 border-b p-4">
            <Activity className="size-4 text-radar" />
            <h2 className="font-semibold">Activité récente</h2>
          </div>
          <ol className="space-y-1 p-2">
            {activity.map((a) => {
              const meta = activityIcon[a.type];
              return (
                <li key={a.id} className="flex items-start gap-3 rounded-lg p-2">
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-md",
                      meta.className,
                    )}
                  >
                    <meta.icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{a.text}</p>
                    <p className="text-xs text-muted-foreground">@{a.creator}</p>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{a.time}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </section>
    </div>
  );
}
