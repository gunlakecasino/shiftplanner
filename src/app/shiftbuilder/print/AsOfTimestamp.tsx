import React from "react";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";

const GLCR_TIME_ZONE = "America/Detroit";
const SHIFT_ROLLOVER_HOUR = 8;
const SHIFT_ROLLOVER_MINUTE = 30;
const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;
const MONTH_NAMES = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
] as const;
const MONTH_NUMBERS = new Map<string, number>(
  MONTHS.flatMap((month, index) => [
    [month, index + 1] as const,
    [MONTH_NAMES[index], index + 1] as const,
  ]),
);

export type AsOfTimestampTone = "current" | "advance" | "past";

export type AsOfTimestampParts = {
  weekday: string;
  dateShort: string;
  time: string;
  meridiem: string;
  timeZone: string;
  full: string;
};

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((entry) => entry.type === type)?.value ?? "";
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftDayKey(day: Pick<DayDef, "dateNum" | "monthYear">): string {
  const [monthName = "", yearText = ""] = day.monthYear
    .trim()
    .toUpperCase()
    .split(/\s+/);
  const month = MONTH_NUMBERS.get(monthName);
  const year = Number(yearText);

  if (!month || !Number.isInteger(year)) {
    return "";
  }
  return dateKey(year, month, day.dateNum);
}

export function operationalShiftDateKey(
  value: string | Date,
): string {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: GLCR_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const year = Number(part(parts, "year"));
  const month = Number(part(parts, "month"));
  const day = Number(part(parts, "day"));
  const hour = Number(part(parts, "hour"));
  const minute = Number(part(parts, "minute"));
  const beforeRollover =
    hour < SHIFT_ROLLOVER_HOUR ||
    (hour === SHIFT_ROLLOVER_HOUR && minute < SHIFT_ROLLOVER_MINUTE);

  if (!beforeRollover) {
    return dateKey(year, month, day);
  }

  const previous = new Date(Date.UTC(year, month - 1, day));
  previous.setUTCDate(previous.getUTCDate() - 1);
  return dateKey(
    previous.getUTCFullYear(),
    previous.getUTCMonth() + 1,
    previous.getUTCDate(),
  );
}

export function asOfTimestampTone(
  shiftDay: Pick<DayDef, "dateNum" | "monthYear">,
  printedAt: string,
): AsOfTimestampTone {
  const selected = shiftDayKey(shiftDay);
  const active = operationalShiftDateKey(printedAt);
  if (selected === active) return "current";
  return selected > active ? "advance" : "past";
}

export function formatAsOfTimestamp(
  value: string | Date,
): AsOfTimestampParts {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: GLCR_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).formatToParts(date);
  const weekday = part(parts, "weekday").toUpperCase();
  const month = part(parts, "month").replace(".", "").toUpperCase();
  const day = part(parts, "day");
  const hour = part(parts, "hour");
  const minute = part(parts, "minute");
  const meridiem = part(parts, "dayPeriod").toUpperCase();
  const timeZone = part(parts, "timeZoneName").toUpperCase();

  return {
    weekday,
    dateShort: `${month} ${day}`,
    time: `${hour}:${minute}`,
    meridiem,
    timeZone,
    full: `${weekday}, ${month} ${day} ${hour}:${minute} ${meridiem} ${timeZone}`,
  };
}

export function AsOfTimestamp({
  value,
  shiftDay,
  label = "AS OF",
  className = "",
}: {
  value: string;
  shiftDay: Pick<DayDef, "dateNum" | "monthYear">;
  label?: string;
  className?: string;
}) {
  const stamp = formatAsOfTimestamp(value);
  const tone = asOfTimestampTone(shiftDay, value);

  return (
    <time
      className={`sb-as-of-timestamp is-${tone} ${className}`.trim()}
      dateTime={new Date(value).toISOString()}
      data-timestamp-tone={tone}
      title={`Printed ${stamp.full}`}
    >
      <span className="sb-as-of-eyebrow">
        <span>{label} {stamp.weekday}</span>
        <span className="sb-as-of-rule" />
      </span>
      <strong className="sb-as-of-date">{stamp.dateShort}</strong>
      <span className="sb-as-of-time-row">
        <strong className="sb-as-of-time">{stamp.time}</strong>
        <span className="sb-as-of-meridiem">{stamp.meridiem}</span>
        <span className="sb-as-of-time-zone">{stamp.timeZone}</span>
      </span>
    </time>
  );
}
