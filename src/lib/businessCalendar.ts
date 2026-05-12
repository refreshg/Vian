import { addDays } from "date-fns";
import { formatInTimeZone, toDate } from "date-fns-tz";

export interface BusinessHoursConfig {
  workdayStartHour: number;
  workdayEndHour: number;
}

/** Bitrix portal / business logic reference timezone (Georgia). */
export const SLA_TIME_ZONE = "Asia/Tbilisi";

const ONE_HOUR_MS = 3600000;

/** Fixed non-working calendar dates (month/day, recurring yearly) in SLA_TIME_ZONE. */
const EXCLUDED_MONTH_DAYS: Array<{ month: number; day: number }> = [
  { month: 5, day: 12 },
  { month: 5, day: 26 },
];

export function isExcludedHolidayInZone(ms: number, timeZone: string): boolean {
  const m = Number(formatInTimeZone(new Date(ms), timeZone, "M"));
  const d = Number(formatInTimeZone(new Date(ms), timeZone, "d"));
  return EXCLUDED_MONTH_DAYS.some((x) => x.month === m && x.day === d);
}

/** ISO weekday in zone: 1 = Monday … 7 = Sunday */
function isoWeekdayInZone(ms: number, timeZone: string): number {
  return Number(formatInTimeZone(new Date(ms), timeZone, "i"));
}

export function isWorkingDayInZone(ms: number, timeZone: string): boolean {
  const wd = isoWeekdayInZone(ms, timeZone);
  if (wd === 6 || wd === 7) return false;
  if (isExcludedHolidayInZone(ms, timeZone)) return false;
  return true;
}

/**
 * True if instant falls on a working day and clock time is in [startHour, endHour) in SLA zone.
 */
export function isInstantInBusinessHoursZoned(
  ms: number,
  bh: BusinessHoursConfig,
  timeZone: string
): boolean {
  if (!Number.isFinite(ms)) return false;
  if (!isWorkingDayInZone(ms, timeZone)) return false;
  const hour = Number(formatInTimeZone(new Date(ms), timeZone, "H"));
  const minute = Number(formatInTimeZone(new Date(ms), timeZone, "m"));
  const mins = hour * 60 + minute + (Number(formatInTimeZone(new Date(ms), timeZone, "s")) || 0) / 60;
  const startM = bh.workdayStartHour * 60;
  const endM = bh.workdayEndHour * 60;
  if (bh.workdayEndHour <= bh.workdayStartHour) return false;
  return mins >= startM && mins < endM;
}

/**
 * Sum of hours within [workdayStartHour, workdayEndHour) on working days between two instants (zone-aware).
 */
export function businessHoursBetweenZoned(
  startMs: number,
  endMs: number,
  bh: BusinessHoursConfig,
  timeZone: string
): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0;
  }
  const { workdayStartHour, workdayEndHour } = bh;
  if (workdayEndHour <= workdayStartHour) return 0;

  const startKey = formatInTimeZone(new Date(startMs), timeZone, "yyyy-MM-dd");
  const endKey = formatInTimeZone(new Date(endMs), timeZone, "yyyy-MM-dd");

  let ymd = startKey;
  let totalMs = 0;
  let guard = 0;
  while (ymd <= endKey && guard++ < 4000) {
    const noon = toDate(`${ymd}T12:00:00`, { timeZone });
    if (isWorkingDayInZone(noon.getTime(), timeZone)) {
      const segStart = toDate(
        `${ymd}T${String(workdayStartHour).padStart(2, "0")}:00:00`,
        { timeZone }
      ).getTime();
      const segEnd = toDate(
        `${ymd}T${String(workdayEndHour).padStart(2, "0")}:00:00`,
        { timeZone }
      ).getTime();
      const overlapStart = Math.max(startMs, segStart);
      const overlapEnd = Math.min(endMs, segEnd);
      if (overlapEnd > overlapStart) totalMs += overlapEnd - overlapStart;
    }
    const nextNoon = addDays(noon, 1);
    ymd = formatInTimeZone(nextNoon, timeZone, "yyyy-MM-dd");
  }

  return totalMs / ONE_HOUR_MS;
}
