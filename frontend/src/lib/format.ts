export function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1).replace(".", ",")} Go`;
  return `${Math.round(mb)} Mo`;
}

export function formatDateFr(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function initials(name: string): string {
  return name
    .replace(/[._]/g, " ")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

export function normalizeUsername(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/(www\.)?tiktok\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

export function isValidUsername(u: string): boolean {
  return /^[a-z0-9._]{2,24}$/.test(u);
}
