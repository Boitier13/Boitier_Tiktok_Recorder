import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/format";

export function ElapsedTimer({
  elapsedSec,
  observedAtMs,
}: {
  elapsedSec: number;
  observedAtMs: number;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const elapsed =
    elapsedSec + (now === null ? 0 : Math.max(0, Math.floor((now - observedAtMs) / 1000)));
  return <>{formatDuration(elapsed)}</>;
}
