export type ExpiryTone = "green" | "amber" | "red";

export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const target = new Date(date);
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function expiryTone(expiry: string | null | undefined): ExpiryTone {
  const d = daysUntil(expiry);
  if (d === null) return "green";
  if (d < 14) return "red";
  if (d <= 60) return "amber";
  return "green";
}

export function expiryLabel(expiry: string | null | undefined): string {
  if (!expiry) return "No expiry";
  const d = daysUntil(expiry)!;
  if (d < 0) return `Expired ${Math.abs(d)}d ago`;
  if (d === 0) return "Expires today";
  return `${d}d remaining`;
}
