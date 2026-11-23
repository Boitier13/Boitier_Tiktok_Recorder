import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

export function CreatorAvatar({ name, live, size = "md" }: { name: string; live?: boolean; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-12 text-base" };
  return (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full bg-secondary font-display font-semibold text-secondary-foreground",
        sizes[size],
        live && "ring-2 ring-live ring-offset-2 ring-offset-card",
      )}
    >
      {initials(name)}
      {live && (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-sm bg-live px-1 text-[9px] font-bold uppercase leading-tight tracking-wider text-live-foreground">
          Live
        </span>
      )}
    </div>
  );
}
