import { createFileRoute } from "@tanstack/react-router";
import { Calendar, Film, FolderOpen, Play, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CreatorAvatar } from "@/components/creator-avatar";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppStore } from "@/lib/app-store";
import { formatDateFr, formatDuration, formatSize } from "@/lib/format";
import type { Recording } from "@/lib/mock-data";

export const Route = createFileRoute("/enregistrements")({
  head: () => ({
    meta: [
      { title: "Enregistrements — Radar LIVE" },
      { name: "description", content: "Retrouvez, lisez et classez les lives TikTok enregistrés par créateur et par date." },
      { property: "og:title", content: "Enregistrements — Radar LIVE" },
      { property: "og:description", content: "Retrouvez, lisez et classez les lives TikTok enregistrés par créateur et par date." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RecordingsPage,
});

function fileName(r: Recording) {
  return `Live_${r.time}.mp4`;
}

function RecordingsPage() {
  const { recordings, deleteRecording, settings } = useAppStore();
  const [query, setQuery] = useState("");
  const [creator, setCreator] = useState("all");
  const [date, setDate] = useState("");
  const [playing, setPlaying] = useState<Recording | null>(null);

  const creatorsList = useMemo(() => Array.from(new Set(recordings.map((r) => r.creator))).sort(), [recordings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recordings
      .filter((r) => (creator === "all" || r.creator === creator) && (!date || r.date === date))
      .filter((r) => !q || r.creator.includes(q) || fileName(r).toLowerCase().includes(q) || r.date.includes(q))
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  }, [recordings, query, creator, date]);

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
  const pathOf = (r: Recording) => `${settings.saveFolder}\\${r.creator}\\${r.date}\\${fileName(r)}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Enregistrements"
        subtitle={`${filtered.length} vidéo${filtered.length > 1 ? "s" : ""} · ${formatSize(totalMB)}`}
        actions={
          <Button variant="secondary" onClick={() => toast("Ouverture du dossier", { description: settings.saveFolder })}>
            <FolderOpen /> Ouvrir le dossier TikTok_Lives
          </Button>
        }
      />

      <div className="panel grid gap-3 p-4 md:grid-cols-[1fr_200px_180px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une vidéo…" className="pl-9" />
        </div>
        <Select value={creator} onValueChange={setCreator}>
          <SelectTrigger aria-label="Filtrer par créateur"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les créateurs</SelectItem>
            {creatorsList.map((c) => (
              <SelectItem key={c} value={c}>@{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="pl-9" aria-label="Filtrer par date" />
        </div>
      </div>

      {byDate.length === 0 ? (
        <div className="panel flex flex-col items-center gap-2 p-12 text-center text-sm text-muted-foreground">
          <Film className="size-8" />
          Aucune vidéo ne correspond à votre recherche.
        </div>
      ) : (
        byDate.map(([day, items]) => (
          <section key={day} className="space-y-2">
            <h2 className="px-1 text-sm font-medium capitalize text-muted-foreground">{formatDateFr(day)}</h2>
            <ul className="panel divide-y">
              {items.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-4 p-3 sm:flex-nowrap">
                  <button
                    type="button"
                    onClick={() => setPlaying(r)}
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
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {r.creator}/{r.date}/{fileName(r)} · {formatSize(r.sizeMB)}
                      </p>
                    </div>
                  </div>
                  <StatusPill kind={r.state} className="hidden md:inline-flex" />
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setPlaying(r)} aria-label="Lire"><Play /></Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toast("Ouverture du dossier", { description: pathOf(r) })}
                      aria-label="Ouvrir le dossier"
                    >
                      <FolderOpen />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Supprimer"
                      onClick={() => {
                        deleteRecording(r.id);
                        toast(`${fileName(r)} supprimée`, { description: `@${r.creator} · ${r.date}` });
                      }}
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

      <Dialog open={!!playing} onOpenChange={(o) => !o && setPlaying(null)}>
        <DialogContent className="max-w-3xl">
          {playing && (
            <>
              <DialogHeader>
                <DialogTitle>@{playing.creator} — {fileName(playing)}</DialogTitle>
                <DialogDescription className="font-mono text-xs">{pathOf(playing)}</DialogDescription>
              </DialogHeader>
              <div className="relative grid aspect-video place-items-center rounded-lg bg-gradient-video">
                <div className="grid size-16 place-items-center rounded-full bg-background/60">
                  <Play className="size-7 text-foreground" />
                </div>
                <div className="absolute inset-x-4 bottom-4 flex items-center gap-3 font-mono text-xs text-muted-foreground">
                  <span>00:00</span>
                  <div className="h-1 flex-1 rounded-full bg-muted"><div className="h-full w-0 rounded-full bg-radar" /></div>
                  <span>{formatDuration(playing.durationSec)}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">La lecture des fichiers vidéo sera active dans le logiciel Windows.</p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
