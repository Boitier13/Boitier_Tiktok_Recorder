import { createFileRoute } from "@tanstack/react-router";
import {
  ArchiveRestore,
  Calendar,
  CircleStop,
  Film,
  FolderOpen,
  HardDrive,
  Play,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CreatorAvatar } from "@/components/creator-avatar";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/lib/app-store";
import {
  moveRecordingToPending,
  openActiveRecordingFolder,
  openRecordingFolder,
  planRecordingRemoval,
  readLibraryChannel,
  readLibraryPending,
  readLibrarySummary,
  recordingMediaUrl,
  restoreLibraryBatch,
  type LibraryPending,
  type LibraryPlan,
  type LibraryRecordingInfo,
  type LibrarySummary,
} from "@/lib/backend";
import { formatDateFr, formatDuration, formatSize } from "@/lib/format";
import type { Recording } from "@/lib/models";

export const Route = createFileRoute("/enregistrements")({
  head: () => ({
    meta: [
      { title: "Enregistrements — Radar LIVE" },
      {
        name: "description",
        content:
          "Retrouvez, lisez et classez les directs TikTok enregistrés par créateur et par date.",
      },
      { property: "og:title", content: "Enregistrements — Radar LIVE" },
      {
        property: "og:description",
        content:
          "Retrouvez, lisez et classez les directs TikTok enregistrés par créateur et par date.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RecordingsPage,
});

function fileName(r: Recording) {
  return r.fileName || `Live_${r.time}.mp4`;
}

const CAPTURE_STATE_PRESENTATION = {
  checking: { kind: "checking", label: "Vérification en cours" },
  live_waiting: { kind: "waiting", label: "LIVE détecté, capture non démarrée" },
  reconnecting: { kind: "reconnecting", label: "Reconnexion en cours" },
  error: { kind: "error", label: "Erreur de capture" },
  processing: { kind: "processing", label: "Finalisation du fichier" },
} as const;

function RecordingsPage() {
  const { recordings, activeRecordings, captureStates, stopRecording, connected, refresh } =
    useAppStore();
  const [librarySummary, setLibrarySummary] = useState<LibrarySummary | null>(null);
  const [libraryPending, setLibraryPending] = useState<LibraryPending | null>(null);
  const [channelLibrary, setChannelLibrary] = useState<LibraryRecordingInfo[]>([]);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [removal, setRemoval] = useState<{ recording: Recording; plan: LibraryPlan | null } | null>(
    null,
  );
  const [planLoading, setPlanLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [creator, setCreator] = useState("all");
  const [date, setDate] = useState("");
  const [playing, setPlaying] = useState<Recording | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const refreshLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const [summary, pending] = await Promise.all([readLibrarySummary(), readLibraryPending()]);
      setLibrarySummary(summary);
      setLibraryPending(pending);
      setLibraryError(null);
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : "Bibliothèque moteur indisponible.");
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    if (creator === "all") {
      setChannelLibrary([]);
      return;
    }
    let active = true;
    readLibraryChannel(`tiktok:${creator}`)
      .then((rows) => {
        if (active) setChannelLibrary(rows);
      })
      .catch((error) => {
        if (active) {
          setChannelLibrary([]);
          setLibraryError(
            error instanceof Error ? error.message : "Détail du créateur indisponible.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [creator]);

  const requestRemovalPlan = async (recording: Recording) => {
    setRemoval({ recording, plan: null });
    setPlanLoading(true);
    try {
      const plan = await planRecordingRemoval(recording.path ?? recording.id);
      setRemoval({ recording, plan });
    } catch (error) {
      setRemoval(null);
      toast.error("Prévisualisation impossible", {
        description:
          error instanceof Error ? error.message : "Le moteur n’a pas préparé le déplacement.",
      });
    } finally {
      setPlanLoading(false);
    }
  };

  const creatorsList = useMemo(
    () => Array.from(new Set(recordings.map((r) => r.creator))).sort(),
    [recordings],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recordings
      .filter((r) => (creator === "all" || r.creator === creator) && (!date || r.date === date))
      .filter(
        (r) =>
          !q ||
          r.creator.includes(q) ||
          fileName(r).toLowerCase().includes(q) ||
          r.date.includes(q),
      )
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  }, [recordings, query, creator, date]);

  const channelLibraryByPath = useMemo(
    () => new Map(channelLibrary.map((item) => [item.path, item])),
    [channelLibrary],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, Recording[]>();
    for (const r of filtered) {
      const list = map.get(r.date) ?? [];
      list.push(r);
      map.set(r.date, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const totalMB = filtered.reduce((s, r) => s + r.sizeMB, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Enregistrements"
        subtitle={`${filtered.length} vidéo${filtered.length > 1 ? "s" : ""} · ${formatSize(totalMB)}`}
        actions={
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await openRecordingFolder();
              } catch (error) {
                toast.error("Ouverture du dossier impossible", {
                  description:
                    error instanceof Error
                      ? error.message
                      : "Le dossier des enregistrements est indisponible.",
                });
              }
            }}
          >
            <FolderOpen /> Ouvrir le dossier
          </Button>
        }
      />

      {activeRecordings.length > 0 && (
        <section className="panel overflow-hidden">
          <div className="border-b p-4">
            <h2 className="font-display text-lg font-semibold">Enregistrements en cours</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              La taille indique ce qui a été écrit. Si elle ne progresse plus, l’état d’attente et
              le délai avant la reprise automatique sont affichés.
            </p>
          </div>
          <ul className="divide-y">
            {activeRecordings.map((active) => (
              <li key={active.creator.id} className="flex flex-wrap items-center gap-3 p-4">
                <CreatorAvatar name={active.creator.displayName} live size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">@{active.creator.username}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {active.fileName} · {formatDuration(active.elapsedSec)} ·{" "}
                    {formatSize(active.sizeMB)}
                  </p>
                  {active.noGrowthSec >= 30 && (
                    <p role="status" className="mt-1 text-xs text-warning">
                      Aucune progression depuis {formatDuration(active.noGrowthSec)}. Arrêt de cette
                      tentative estimé dans{" "}
                      {formatDuration(
                        Math.max(
                          0,
                          Math.max(active.sizeMB > 0 ? active.stallTimeoutSec : 65, 60) -
                            active.noGrowthSec,
                        ),
                      )}
                      .
                    </p>
                  )}
                </div>
                <StatusPill
                  kind={active.noGrowthSec >= 30 ? "waiting" : "recording"}
                  label={active.noGrowthSec >= 30 ? "Données en attente" : "Enregistrement"}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  title={`Ouvrir le dossier de capture de @${active.creator.username}`}
                  aria-label={`Ouvrir le dossier de capture de @${active.creator.username}`}
                  onClick={async () => {
                    try {
                      await openActiveRecordingFolder(active.creator.id);
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
                  <FolderOpen />
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={!connected}
                  onClick={async () => {
                    try {
                      await stopRecording(active.creator.id);
                      toast.success(`Arrêt demandé pour @${active.creator.username}`, {
                        description: "Le moteur termine le fichier et prépare la vidéo.",
                      });
                    } catch (error) {
                      toast.error("Arrêt impossible", {
                        description:
                          error instanceof Error
                            ? error.message
                            : "Commande refusée par le moteur.",
                      });
                    }
                  }}
                >
                  <CircleStop /> Arrêter
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {captureStates.length > 0 && (
        <section className="panel overflow-hidden">
          <div className="border-b p-4">
            <h2 className="font-display text-lg font-semibold">
              Vérifications, reprises et erreurs
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Ces états ne signifient pas tous qu’un fichier est en cours d’écriture.
            </p>
          </div>
          <ul className="divide-y">
            {captureStates.map((state) => {
              const presentation = CAPTURE_STATE_PRESENTATION[state.kind];
              return (
                <li
                  key={`${state.creator.id}-${state.kind}`}
                  className="flex flex-wrap items-center gap-3 p-4"
                >
                  <CreatorAvatar name={state.creator.displayName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">@{state.creator.username}</p>
                    {state.detail && (
                      <p className="truncate text-xs text-muted-foreground">{state.detail}</p>
                    )}
                  </div>
                  <StatusPill kind={presentation.kind} label={presentation.label} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="panel space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <HardDrive className="size-4 text-radar" /> Bibliothèque du moteur
            </h2>
            <p className="text-xs text-muted-foreground">
              {librarySummary?.scanned_at
                ? `Analyse réelle · ${new Date(librarySummary.scanned_at).toLocaleString("fr-FR")}`
                : libraryLoading
                  ? "Analyse des dossiers d’enregistrement…"
                  : "Résumé de stockage non disponible"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refreshLibrary()}
            disabled={libraryLoading}
          >
            <RefreshCw className={libraryLoading ? "animate-spin" : ""} /> Actualiser
          </Button>
        </div>
        {libraryError && (
          <p role="status" className="text-sm text-warning">
            {libraryError}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md bg-secondary/50 p-3">
            <p className="text-xs text-muted-foreground">Vidéos et fichiers bruts</p>
            <p className="mt-1 font-display text-xl font-semibold">
              {librarySummary?.recordings?.files ?? "—"}
            </p>
          </div>
          <div className="rounded-md bg-secondary/50 p-3">
            <p className="text-xs text-muted-foreground">Espace occupé</p>
            <p className="mt-1 font-display text-xl font-semibold">
              {librarySummary?.recordings?.bytes !== undefined
                ? formatSize(librarySummary.recordings.bytes / (1024 * 1024))
                : "—"}
            </p>
          </div>
          <div className="rounded-md bg-secondary/50 p-3">
            <p className="text-xs text-muted-foreground">Créateurs archivés</p>
            <p className="mt-1 font-display text-xl font-semibold">
              {librarySummary?.channel_count ?? "—"}
            </p>
          </div>
        </div>
      </section>

      {libraryPending && libraryPending.files > 0 && (
        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
            <div>
              <h2 className="font-display font-semibold">Éléments mis de côté</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {libraryPending.files} fichier(s) ·{" "}
                {formatSize(libraryPending.bytes / (1024 * 1024))} · restauration possible par lot ;
                purge éventuelle selon la configuration moteur
              </p>
            </div>
            <ArchiveRestore className="size-5 text-warning" />
          </div>
          <ul className="divide-y">
            {libraryPending.batches.map((batch) => (
              <li key={batch.batch} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">Lot de {batch.files} fichier(s)</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(batch.time * 1000).toLocaleString("fr-FR")} ·{" "}
                    {formatSize(batch.bytes / (1024 * 1024))}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!connected}
                  onClick={async () => {
                    try {
                      await restoreLibraryBatch(batch.batch);
                      await Promise.all([refresh(), refreshLibrary()]);
                      toast.success("Lot restauré dans la bibliothèque");
                    } catch (error) {
                      toast.error("Restauration impossible", {
                        description:
                          error instanceof Error
                            ? error.message
                            : "Le moteur a refusé la restauration.",
                      });
                    }
                  }}
                >
                  <ArchiveRestore /> Restaurer
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="panel grid gap-3 p-4 md:grid-cols-[1fr_200px_180px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une vidéo…"
            className="pl-9"
          />
        </div>
        <Select value={creator} onValueChange={setCreator}>
          <SelectTrigger aria-label="Filtrer par créateur">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les créateurs</SelectItem>
            {creatorsList.map((c) => (
              <SelectItem key={c} value={c}>
                @{c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="pl-9"
            aria-label="Filtrer par date"
          />
        </div>
      </div>

      {byDate.length === 0 ? (
        <div className="panel flex flex-col items-center gap-2 p-12 text-center text-sm text-muted-foreground">
          <Film className="size-8" />
          Aucune vidéo terminée ne correspond à votre recherche.
        </div>
      ) : (
        byDate.map(([day, items]) => (
          <section key={day} className="space-y-2">
            <h2 className="px-1 text-sm font-medium capitalize text-muted-foreground">
              {formatDateFr(day)}
            </h2>
            <ul className="panel divide-y">
              {items.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-4 p-3 sm:flex-nowrap">
                  <button
                    type="button"
                    onClick={() => {
                      setPlaybackError(null);
                      setPlaying(r);
                    }}
                    className="group relative grid aspect-video w-28 shrink-0 place-items-center overflow-hidden rounded-md bg-gradient-video"
                    aria-label={`Lire ${fileName(r)}`}
                  >
                    <Play className="size-5 text-foreground/80 transition-transform group-hover:scale-110" />
                    <span className="absolute bottom-1 right-1 rounded bg-background/80 px-1 font-mono text-[10px]">
                      {formatDuration(r.durationSec)}
                    </span>
                  </button>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <CreatorAvatar name={r.creator} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">@{r.creator}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {channelLibraryByPath.get(r.path ?? r.id)?.title ||
                          `${r.creator}/${r.date}/${fileName(r)}`}
                      </p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {formatSize(r.sizeMB)}
                        {(channelLibraryByPath.get(r.path ?? r.id)?.clip_count ?? 0) > 0 &&
                          ` · ${channelLibraryByPath.get(r.path ?? r.id)?.clip_count} extrait(s)`}
                      </p>
                    </div>
                  </div>
                  <StatusPill kind={r.state} className="hidden md:inline-flex" />
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setPlaybackError(null);
                        setPlaying(r);
                      }}
                      aria-label="Lire"
                    >
                      <Play />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Ouvrir le dossier de cette vidéo"
                      aria-label={`Ouvrir le dossier de ${fileName(r)}`}
                      onClick={async () => {
                        try {
                          await openRecordingFolder(r.path ?? r.id);
                        } catch (error) {
                          toast.error("Ouverture du dossier impossible", {
                            description:
                              error instanceof Error
                                ? error.message
                                : "Le dossier de cette vidéo est indisponible.",
                          });
                        }
                      }}
                    >
                      <FolderOpen />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Déplacer ${fileName(r)} vers les éléments mis de côté`}
                      disabled={!connected}
                      title="Déplacer vers les éléments mis de côté, avec possibilité de restauration"
                      onClick={() => void requestRemovalPlan(r)}
                    >
                      <Trash2 className="text-muted-foreground" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <AlertDialog
        open={!!removal}
        onOpenChange={(open) => {
          if (!open && !planLoading) setRemoval(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mettre cette vidéo de côté ?</AlertDialogTitle>
            <AlertDialogDescription>
              {removal?.recording.fileName}. Le moteur déplace la vidéo et ses fichiers associés
              vers les éléments mis de côté ; cette action n’est pas une suppression définitive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {planLoading ? (
            <p className="text-sm text-muted-foreground">Vérification des fichiers concernés…</p>
          ) : removal?.plan ? (
            <div className="rounded-md bg-secondary/60 p-3 text-sm">
              {removal.plan.files > 0 ? (
                <p>
                  {removal.plan.files} fichier(s) · {formatSize(removal.plan.bytes / (1024 * 1024))}
                </p>
              ) : (
                <p>Le moteur n’a identifié aucun fichier déplaçable.</p>
              )}
              {Object.keys(removal.plan.blocked ?? {}).length > 0 && (
                <p className="mt-2 text-warning">
                  Un fichier est en cours d’utilisation ou bloqué ; aucune action ne sera exécutée.
                </p>
              )}
              {removal.plan.skipped_count > 0 && (
                <p className="mt-2 text-muted-foreground">
                  {removal.plan.skipped_count} élément(s) associé(s) ne seront pas déplacés.
                </p>
              )}
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={planLoading}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                planLoading ||
                !removal?.plan ||
                removal.plan.files < 1 ||
                Object.keys(removal.plan.blocked ?? {}).length > 0
              }
              onClick={async () => {
                if (!removal) return;
                try {
                  const result = await moveRecordingToPending(
                    removal.recording.path ?? removal.recording.id,
                  );
                  setRemoval(null);
                  await Promise.all([refresh(), refreshLibrary()]);
                  toast.success("Vidéo déplacée vers les éléments mis de côté", {
                    description: `${result.done} fichier(s) déplacé(s). Vous pourrez restaurer le lot.`,
                  });
                } catch (error) {
                  toast.error("Déplacement refusé", {
                    description:
                      error instanceof Error ? error.message : "Le moteur n’a rien déplacé.",
                  });
                }
              }}
            >
              Déplacer et garder restaurable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!playing}
        onOpenChange={(o) => {
          if (!o) {
            setPlaying(null);
            setPlaybackError(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          {playing && (
            <>
              <DialogHeader>
                <DialogTitle>
                  @{playing.creator} — {fileName(playing)}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {formatDateFr(playing.date)} · {formatDuration(playing.durationSec)} ·{" "}
                  {formatSize(playing.sizeMB)}
                </DialogDescription>
              </DialogHeader>
              <video
                key={playing.id}
                className="max-h-[70vh] w-full rounded-lg bg-black"
                controls
                autoPlay
                playsInline
                preload="metadata"
                src={recordingMediaUrl(playing.id)}
                onError={() =>
                  setPlaybackError(
                    "Le fichier vidéo n’est pas disponible ou n’est pas lisible par ce navigateur.",
                  )
                }
              >
                Votre navigateur ne peut pas lire ce fichier vidéo.
              </video>
              {playbackError ? (
                <p role="alert" className="text-sm text-destructive">
                  {playbackError}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Lecture du MP4 local par le moteur ; les commandes natives permettent le son et la
                  navigation.
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
