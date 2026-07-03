// Pure recurrence math — no ShiftBuilder imports, no Supabase, no Date.now()
// side effects unless explicitly passed in. Deliberately small: this project's
// ops_work_items schema stores one recurrence_days array whose meaning depends
// on recurrence_type, not a full RFC 5545 RRULE. See RecurrenceType in types.ts.
//
// Instances are materialized (real rows), never computed on the fly (T4) — this
// module only answers "what's the next due date," the caller decides whether
// and when to actually insert the next row.

import type { RecurrenceType } from "./types";

export interface RecurrenceRule {
  recurrenceType: RecurrenceType;
  /** Weekly/biweekly: weekday numbers 0(Sun)-6(Sat). Monthly: day-of-month numbers. */
  recurrenceDays: number[] | null;
  /** Daily/custom cadence in days. Defaults to 1. */
  advanceDays: number;
}

function toUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function parseISODate(iso: string): Date {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, day ?? 1));
}

function formatISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Computes the next due date strictly after `fromDateISO` for a recurrence rule.
 * Returns null if the rule can't produce a next date (e.g. weekly/monthly with no
 * days configured).
 */
export function computeNextDueDate(rule: RecurrenceRule, fromDateISO: string): string | null {
  const from = toUtcMidnight(parseISODate(fromDateISO));
  const advance = Math.max(1, rule.advanceDays || 1);

  switch (rule.recurrenceType) {
    case "daily":
    case "custom": {
      return formatISODate(addDays(from, advance));
    }

    case "weekly":
    case "biweekly": {
      const days = (rule.recurrenceDays ?? []).filter((d) => d >= 0 && d <= 6);
      if (days.length === 0) return null;
      const cadenceDays = rule.recurrenceType === "biweekly" ? 14 : 7;
      // Search forward day-by-day up to two cadence windows — simple and correct,
      // avoids needing a separate recurrence anchor date for biweekly parity.
      for (let i = 1; i <= cadenceDays * 2; i++) {
        const candidate = addDays(from, i);
        if (days.includes(candidate.getUTCDay())) {
          if (rule.recurrenceType === "weekly" || i >= cadenceDays - 6) {
            return formatISODate(candidate);
          }
        }
      }
      return null;
    }

    case "monthly": {
      const monthDays = (rule.recurrenceDays ?? []).filter((d) => d >= 1 && d <= 31).sort((a, b) => a - b);
      if (monthDays.length === 0) return null;
      // Same month, first configured day after `from`.
      const sameMonthCandidate = monthDays.find((day) => day > from.getUTCDate());
      if (sameMonthCandidate !== undefined) {
        const candidate = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), sameMonthCandidate));
        if (candidate.getUTCMonth() === from.getUTCMonth()) return formatISODate(candidate);
      }
      // Otherwise the smallest configured day next month (clamped to that month's length).
      const nextMonth = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
      const daysInNextMonth = new Date(
        Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 0),
      ).getUTCDate();
      const day = Math.min(monthDays[0], daysInNextMonth);
      return formatISODate(new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), day)));
    }

    default:
      return null;
  }
}
