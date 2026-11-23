import { cn } from "@/lib/utils";

type Kind = "live" | "recording" | "offline" | "unknown" | "paused" | "complete" | "interrupted";

const styles: Record<Kind, { label: string; className: string; dot: string }> = {
  live: {
    label: "En direct",
    className: "bg-live/15 text-live",
    dot: "bg-live animate-live-pulse",
  },
  recording: {
    label: "Enregistrement",
    className: "bg-live/15 text-live",
    dot: "bg-live animate-live-pulse",
  },
  offline: {
    label: "Hors ligne",
    className: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/60",
  },
  unknown: { label: "État inconnu", className: "bg-warning/15 text-warning", dot: "bg-warning" },
  paused: { label: "En pause", className: "bg-warning/15 text-warning", dot: "bg-warning" },
  complete: { label: "Complète", className: "bg-success/15 text-success", dot: "bg-success" },
  interrupted: {
    label: "Coupée puis reprise",
    className: "bg-warning/15 text-warning",
    dot: "bg-warning",
  },
};

export function StatusPill({
  kind,
  label,
  className,
}: {
  kind: Kind;
  label?: string;
  className?: string;
}) {
  const s = styles[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        s.className,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {label ?? s.label}
    </span>
  );
}
