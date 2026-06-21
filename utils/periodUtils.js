import { fromKey, toKey } from "../components/GoalsStore";

// Period helpers for frequency / periodQuantity goal types.
// Weeks start on Sunday to match the app's getDay()/calendar conventions.

export const PERIOD_WEEK = "week";
export const PERIOD_MONTH = "month";

function normalizePeriod(period) {
  return period === PERIOD_MONTH ? PERIOD_MONTH : PERIOD_WEEK;
}

function atMidnight(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Start date (midnight) of the period containing the given date key. */
export function getPeriodStart(dateKey, period) {
  const date = atMidnight(fromKey(dateKey));
  if (normalizePeriod(period) === PERIOD_MONTH) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }
  // Week: back up to Sunday.
  const day = date.getDay(); // 0 = Sunday
  const start = new Date(date);
  start.setDate(date.getDate() - day);
  return atMidnight(start);
}

/** End date (midnight of the last day) of the period containing the given date key. */
export function getPeriodEnd(dateKey, period) {
  const start = getPeriodStart(dateKey, period);
  if (normalizePeriod(period) === PERIOD_MONTH) {
    return new Date(start.getFullYear(), start.getMonth() + 1, 0);
  }
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return end;
}

/**
 * Stable identifier for the period containing a date key, derived from the
 * period start date to avoid ISO-week edge cases.
 * Week  -> "W:YYYY-MM-DD" (the Sunday)
 * Month -> "M:YYYY-MM"
 */
export function getPeriodKey(dateKey, period) {
  const start = getPeriodStart(dateKey, period);
  if (normalizePeriod(period) === PERIOD_MONTH) {
    const y = start.getFullYear();
    const m = String(start.getMonth() + 1).padStart(2, "0");
    return `M:${y}-${m}`;
  }
  return `W:${toKey(start)}`;
}

/** All YYYY-MM-DD date keys within the period containing the given date key. */
export function getPeriodDateKeys(dateKey, period) {
  const start = getPeriodStart(dateKey, period);
  const end = getPeriodEnd(dateKey, period);
  const keys = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    keys.push(toKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/**
 * Ordered list of period descriptors covering [startDateKey, endDateKey].
 * Each descriptor: { key, startKey, endKey, isComplete } where isComplete is
 * true when the whole period has elapsed on or before endDateKey.
 */
export function enumeratePeriods(startDateKey, endDateKey, period) {
  const normalized = normalizePeriod(period);
  const end = atMidnight(fromKey(endDateKey));
  let cursorStart = getPeriodStart(startDateKey, normalized);
  const periods = [];

  for (let i = 0; i < 5000; i += 1) {
    if (cursorStart.getTime() > end.getTime()) break;
    const cursorStartKey = toKey(cursorStart);
    const periodEnd = getPeriodEnd(cursorStartKey, normalized);

    periods.push({
      key: getPeriodKey(cursorStartKey, normalized),
      startKey: cursorStartKey,
      endKey: toKey(periodEnd),
      // A period is fully elapsed once it ends before the reference date.
      isComplete: periodEnd.getTime() < end.getTime(),
    });

    // Advance to the first day of the next period.
    const next = new Date(periodEnd);
    next.setDate(next.getDate() + 1);
    cursorStart = getPeriodStart(toKey(next), normalized);
  }

  return periods;
}

/** Human label for the current period, e.g. "this week" / "this month". */
export function getPeriodLabel(period) {
  return normalizePeriod(period) === PERIOD_MONTH ? "this month" : "this week";
}

/** Short noun for a period, e.g. "week" / "month". */
export function getPeriodNoun(period) {
  return normalizePeriod(period) === PERIOD_MONTH ? "month" : "week";
}

export const MAX_FREQUENCY_DAYS_PER_WEEK = 7;
export const MAX_FREQUENCY_DAYS_PER_MONTH = 31;

/** Max distinct completion days allowed for frequency goals in a period. */
export function getMaxFrequencyDays(period) {
  return normalizePeriod(period) === PERIOD_MONTH
    ? MAX_FREQUENCY_DAYS_PER_MONTH
    : MAX_FREQUENCY_DAYS_PER_WEEK;
}

export function clampFrequencyDays(value, period) {
  const max = getMaxFrequencyDays(period);
  const n = Math.floor(Number(value) || 0);
  if (n < 1) return 1;
  return Math.min(n, max);
}

export function normalizeFrequencyDaysInput(value, period) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  const max = getMaxFrequencyDays(period);
  const n = Number(digits);
  if (!Number.isFinite(n) || n < 1) return "";
  if (n > max) return String(max);
  return digits.slice(0, 2);
}
