// Date range helpers. Week is Mon–Sat (6 working days).
// All dates are handled as ISO yyyy-mm-dd strings in local time.

export type RangeKind = "day" | "week" | "month" | "custom";
export type DateRange = { from: string; to: string };

const pad = (n: number) => String(n).padStart(2, "0");

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

// Monday of the week containing `date`. Sunday rolls back to previous Mon.
function startOfWeekMon(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d;
}

export function getWeekRange(anchor: Date = new Date()): DateRange {
  const mon = startOfWeekMon(anchor);
  const sat = new Date(mon);
  sat.setDate(mon.getDate() + 5); // Mon + 5 = Sat
  return { from: toISO(mon), to: toISO(sat) };
}

export function getDayRange(anchor: Date = new Date()): DateRange {
  const iso = toISO(anchor);
  return { from: iso, to: iso };
}

export function getMonthRange(anchor: Date = new Date()): DateRange {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { from: toISO(first), to: toISO(last) };
}

export function rangeForKind(kind: RangeKind, anchor: Date = new Date()): DateRange {
  if (kind === "day") return getDayRange(anchor);
  if (kind === "week") return getWeekRange(anchor);
  if (kind === "month") return getMonthRange(anchor);
  return getDayRange(anchor); // custom defaults to today; caller overrides
}

// Count of Mon–Sat days inside [from, to] inclusive.
export function workingDaysInRange(range: DateRange): number {
  const start = fromISO(range.from);
  const end = fromISO(range.to);
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const d = cur.getDay();
    if (d !== 0) count += 1; // exclude Sunday
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export function formatRangeLabel(kind: RangeKind, range: DateRange): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const f = (s: string) => new Intl.DateTimeFormat("en-AU", opts).format(fromISO(s));
  if (kind === "day") return f(range.from);
  if (kind === "month") {
    return new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric" }).format(fromISO(range.from));
  }
  return `${f(range.from)} – ${f(range.to)}`;
}

export function shiftRange(kind: RangeKind, range: DateRange, dir: -1 | 1): DateRange {
  const anchor = fromISO(range.from);
  if (kind === "day") {
    anchor.setDate(anchor.getDate() + dir);
    return getDayRange(anchor);
  }
  if (kind === "week") {
    anchor.setDate(anchor.getDate() + dir * 7);
    return getWeekRange(anchor);
  }
  if (kind === "month") {
    anchor.setMonth(anchor.getMonth() + dir);
    return getMonthRange(anchor);
  }
  // custom: shift by span length
  const span =
    (fromISO(range.to).getTime() - fromISO(range.from).getTime()) / (1000 * 60 * 60 * 24) + 1;
  const newFrom = new Date(anchor);
  newFrom.setDate(newFrom.getDate() + dir * span);
  const newTo = new Date(newFrom);
  newTo.setDate(newTo.getDate() + span - 1);
  return { from: toISO(newFrom), to: toISO(newTo) };
}
