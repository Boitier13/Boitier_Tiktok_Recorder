import { Link } from "@tanstack/react-router";
import { Film, Radar, Settings, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useAppStore } from "@/lib/app-store";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Surveillance", icon: Radar },
  { to: "/createurs", label: "Mes créateurs", icon: Users },
  { to: "/enregistrements", label: "Enregistrements", icon: Film },
  { to: "/parametres", label: "Paramètres", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const {
    monitoringActive,
    nextCheckIn,
    activeRecordings,
    creators,
    connected,
    connectionError,
    loading,
    engine,
  } = useAppStore();
  const liveCount = creators.filter((c) => c.status === "live" && c.enabled).length;
  const healthProblems = engine?.health?.problems ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* The native WebView2 window owns minimize, maximize, and close controls. */}
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-sidebar-border bg-titlebar px-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="relative grid size-5 place-items-center rounded-full bg-radar/15">
            <span className="size-2 rounded-full bg-radar" />
          </span>
          <span className="font-display font-semibold text-foreground">
            BTL · Boitier Tiktok Live
          </span>
          <span className="hidden sm:inline">— surveillance TikTok LIVE</span>
        </div>
        <span className="hidden items-center gap-2 md:flex">
          <span
            className={cn("size-1.5 rounded-full", monitoringActive ? "bg-success" : "bg-warning")}
          />
          {!connected
            ? "Moteur local indisponible"
            : monitoringActive
              ? nextCheckIn === null
                ? "Session moteur active"
                : `Prochaine vérification dans ${nextCheckIn} s`
              : "Session moteur arrêtée"}
        </span>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="shrink-0 border-b border-sidebar-border bg-sidebar md:w-60 md:border-b-0 md:border-r">
          <nav className="flex gap-1 overflow-x-auto p-2 md:flex-col md:p-3">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                className="group flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground"
              >
                <item.icon className="size-4 text-muted-foreground group-data-[status=active]:text-radar" />
                <span>{item.label}</span>
                {item.to === "/" && liveCount > 0 && (
                  <span className="ml-auto rounded-full bg-live px-1.5 text-[10px] font-bold text-live-foreground">
                    {liveCount}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          <div className="hidden p-3 md:block">
            <div className="rounded-lg border border-sidebar-border bg-surface p-3 text-xs">
              <p className="font-medium text-foreground">Application locale</p>
              <p className="mt-1 text-muted-foreground">
                La fenêtre WebView2 se masque dans le tray ; le démarrage automatique se règle dans
                Paramètres sous Windows.
              </p>
              <p className="mt-3 flex items-center gap-2 text-muted-foreground">
                <span className="size-1.5 rounded-full bg-live animate-live-pulse" />
                {activeRecordings.length} enregistrement{activeRecordings.length > 1 ? "s" : ""} en
                cours
              </p>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-4 p-4 md:p-8">
          <div
            role="status"
            className={cn(
              "rounded-lg border p-3 text-sm",
              connected
                ? "border-warning/30 bg-warning/10 text-warning"
                : "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {connected
              ? `Intégration en cours : roster, session, enregistrements et réglages viennent du moteur. Les commandes de fichiers Windows non intégrées restent indisponibles.${healthProblems.length ? ` Vérifications moteur : ${healthProblems.join(" ; ")}.` : ""}`
              : loading
                ? "Connexion au moteur local…"
                : `Moteur local déconnecté${connectionError ? ` : ${connectionError}` : ""}. Lancez l’hôte BTL pour utiliser les données réelles.`}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
