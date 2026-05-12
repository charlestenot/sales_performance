// Ramp curves are stored as JSON arrays on Role.rampPct, one entry per month
// from arrival. The interpretation depends on the global `ramp_unit` setting:
//   - "pct": values are fractions (0–1) of the role's base quota
//   - "usd": values are absolute dollar quotas per month
// Past the end of the curve, the rep is treated as fully ramped (100% of base).

export type RampUnit = "pct" | "usd";

export function parseRamp(json: string | null | undefined): number[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : 0;
    });
  } catch {
    return [];
  }
}

export function serializeRamp(arr: number[]): string {
  return JSON.stringify(
    arr.map((x) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : 0;
    })
  );
}

// Back-compat aliases (some files still import the older names).
export const parseRampPct = parseRamp;
export const serializeRampPct = serializeRamp;

// Months between rep's start date and the entry month (both rounded to first
// of month UTC). 0 = entry month is the arrival month (M1).
export function seniorityMonths(startDate: Date | null | undefined, entryMonth: Date): number {
  if (!startDate) return -1;
  const start = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
  const end = new Date(Date.UTC(entryMonth.getUTCFullYear(), entryMonth.getUTCMonth(), 1));
  return (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
}

// Returns the FRUP fraction (0–1) for a given seniority. Null start date or
// past-the-ramp = fully ramped (1.0).
export function suggestedFrupPct(rampPct: number[], seniority: number): number {
  if (seniority < 0) return 1;
  if (rampPct.length === 0) return 1;
  if (seniority >= rampPct.length) return 1;
  return rampPct[seniority] ?? 1;
}

// Unit-aware suggestion. Returns { quota, frupPct } for the entry month given
// the role's base quota, ramp curve, ramp unit, and seniority in months.
export function suggestedFromRamp(opts: {
  baseQuota: number;
  ramp: number[];
  unit: RampUnit;
  seniority: number;
}): { quota: number; frupPct: number } {
  const { baseQuota, ramp, unit, seniority } = opts;
  if (seniority < 0 || ramp.length === 0 || seniority >= ramp.length) {
    // Unknown or past-the-ramp → fully ramped.
    return { quota: baseQuota, frupPct: 1 };
  }
  const v = ramp[seniority] ?? 0;
  if (unit === "usd") {
    const frup = baseQuota > 0 ? v / baseQuota : 0;
    return { quota: v, frupPct: frup };
  }
  return { quota: baseQuota * v, frupPct: v };
}
