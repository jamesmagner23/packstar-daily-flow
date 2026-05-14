// Australian English. Conservative on numbers.
export const aud = (n: number | null | undefined) => {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n);
};

export const pct = (n: number | null | undefined) => {
  if (n == null) return "—";
  return `${Math.round(n)}%`;
};

export const shortDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" }).format(date);
};

export const longDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
};

export const businessDaysRemaining = (deadline: string | Date | null | undefined): number | null => {
  if (!deadline) return null;
  const target = typeof deadline === "string" ? new Date(deadline) : deadline;
  const now = new Date();
  let count = 0;
  const cur = new Date(now);
  cur.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  if (target < cur) {
    while (cur > target) {
      cur.setDate(cur.getDate() - 1);
      const d = cur.getDay();
      if (d !== 0 && d !== 6) count -= 1;
    }
    return count;
  }
  while (cur < target) {
    cur.setDate(cur.getDate() + 1);
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count += 1;
  }
  return count;
};
