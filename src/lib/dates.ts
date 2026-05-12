// Months are stored as the first day of the month at midnight UTC.
// `2026-05` → Date(Date.UTC(2026, 4, 1)).

export function firstOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function currentMonthUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function parseMonthString(s: string): Date | null {
  // Accepts "YYYY-MM" or "YYYY-MM-DD".
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11) return null;
  return new Date(Date.UTC(year, month, 1));
}

export function formatMonth(d: Date): string {
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function toMonthInputValue(d: Date): string {
  // For <input type="month"> — expects YYYY-MM.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
