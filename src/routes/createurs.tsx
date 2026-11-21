import { createFileRoute } from "@tanstack/react-router";
import { Download, Plus, Search, Trash2, Upload } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CreatorAvatar } from "@/components/creator-avatar";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAppStore } from "@/lib/app-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/createurs")({
  head: () => ({
    meta: [
      { title: "Mes créateurs — Radar LIVE" },
      { name: "description", content: "Ajoutez, mettez en pause ou retirez les créateurs TikTok que Radar LIVE surveille." },
      { property: "og:title", content: "Mes créateurs — Radar LIVE" },
      { property: "og:description", content: "Ajoutez, mettez en pause ou retirez les créateurs TikTok que Radar LIVE surveille." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CreatorsPage,
});

type Filter = "all" | "live" | "offline" | "paused";

function CreatorsPage() {
  const { creators, addCreator, removeCreator, toggleCreator } = useAppStore();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const counts = {
    all: creators.length,
    live: creators.filter((c) => c.enabled && c.status === "live").length,
    offline: creators.filter((c) => c.enabled && c.status === "offline").length,
    paused: creators.filter((c) => !c.enabled).length,
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return creators.filter((c) => {
      if (q && !c.username.includes(q) && !c.displayName.toLowerCase().includes(q)) return false;
      if (filter === "live") return c.enabled && c.status === "live";
      if (filter === "offline") return c.enabled && c.status === "offline";
      if (filter === "paused") return !c.enabled;
      return true;
    });
  }, [creators, query, filter]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const err = addCreator(username);
    setError(err);
    if (!err) {
      toast.success("Créateur ajouté", { description: "Radar LIVE vérifie s'il est déjà en direct." });
      setUsername("");
    }
  }

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "Tous" },
    { key: "live", label: "En direct" },
    { key: "offline", label: "Hors ligne" },
    { key: "paused", label: "En pause" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Mes créateurs"
        subtitle="Seules les personnes de cette liste sont surveillées."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => toast("Importer une liste", { description: "Disponible dans la version Windows." })}>
              <Upload /> Importer
            </Button>
            <Button variant="ghost" size="sm" onClick={() => toast("Exporter la liste", { description: "Disponible dans la version Windows." })}>
              <Download /> Exporter
            </Button>
          </>
        }
      />

      <form onSubmit={onSubmit} className="panel p-4">
        <label htmlFor="username" className="text-sm font-medium">Ajouter un créateur</label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
            <Input
              id="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError(null);
              }}
              placeholder="nom_utilisateur ou lien tiktok.com/@…"
              className="pl-7"
              aria-invalid={!!error}
            />
          </div>
          <Button type="submit"><Plus /> Ajouter</Button>
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </form>

      <div className="panel">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-1">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  filter === f.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label} <span className="ml-1 font-mono text-xs text-muted-foreground">{counts[f.key]}</span>
              </button>
            ))}
          </div>
          <div className="relative md:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher…" className="pl-9" />
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">Aucun créateur ne correspond.</p>
        ) : (
          <ul className="divide-y">
            {filtered.map((c) => {
              const kind = !c.enabled ? "paused" : c.status === "live" ? "live" : "offline";
              return (
                <li key={c.id} className={cn("flex items-center gap-4 px-4 py-3", !c.enabled && "opacity-60")}>
                  <CreatorAvatar name={c.displayName} live={c.enabled && c.status === "live"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">@{c.username}</p>
                  </div>
                  <div className="hidden w-44 text-xs text-muted-foreground md:block">
                    <p className="uppercase tracking-wider">Dernier live</p>
                    <p className="text-foreground">{c.lastLive}</p>
                  </div>
                  <StatusPill kind={kind} className="hidden sm:inline-flex" />
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={c.enabled}
                      onCheckedChange={() => {
                        toggleCreator(c.id);
                        toast(c.enabled ? `Surveillance de @${c.username} en pause` : `Surveillance de @${c.username} réactivée`);
                      }}
                      aria-label={`Surveiller @${c.username}`}
                    />
                    <span className="hidden lg:inline">Surveiller</span>
                  </label>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Retirer @${c.username}`}>
                        <Trash2 className="text-muted-foreground" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Retirer @{c.username} ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Radar LIVE ne surveillera plus ce créateur. Ses vidéos déjà enregistrées sont conservées.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            removeCreator(c.id);
                            toast(`@${c.username} retiré de la liste`);
                          }}
                        >
                          Retirer
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
