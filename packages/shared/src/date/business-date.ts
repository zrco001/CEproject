/**
 * Business dates (expense date, billing date, due date…) are calendar dates without a time,
 * stored as PostgreSQL DATE and exchanged as "YYYY-MM-DD" (ADR-05).
 * Instants (createdAt, postedAt…) are UTC and only converted for display.
 */

export const DEFAULT_TIMEZONE = 'Asia/Taipei';

export type BusinessDate = string & { readonly __brand: 'BusinessDate' };

export class InvalidBusinessDateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBusinessDateError';
  }
}

const BUSINESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function isBusinessDate(value: unknown): value is BusinessDate {
  if (typeof value !== 'string') {
    return false;
  }
  const match = BUSINESS_DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day
  );
}

export function parseBusinessDate(value: string): BusinessDate {
  if (!isBusinessDate(value)) {
    throw new InvalidBusinessDateError(
      'Invalid business date: expected an existing YYYY-MM-DD date.',
    );
  }
  return value;
}

export function businessDateFromParts(year: number, month: number, day: number): BusinessDate {
  const value = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return parseBusinessDate(value);
}

interface DateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function partsOf(date: BusinessDate): DateParts {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

const zonedFormatters = new Map<string, Intl.DateTimeFormat>();

function zonedFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = zonedFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    zonedFormatters.set(timeZone, formatter);
  }
  return formatter;
}

interface ZonedParts extends DateParts {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const lookup: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const part of zonedFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') {
      lookup[part.type] = Number(part.value);
    }
  }
  return {
    year: lookup.year ?? 0,
    month: lookup.month ?? 0,
    day: lookup.day ?? 0,
    hour: lookup.hour ?? 0,
    minute: lookup.minute ?? 0,
    second: lookup.second ?? 0,
  };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date of an instant as seen in the organisation's timezone. */
export function toBusinessDate(instant: Date, timeZone: string = DEFAULT_TIMEZONE): BusinessDate {
  const { year, month, day } = zonedParts(instant, timeZone);
  return businessDateFromParts(year, month, day);
}

/** "Today" in the organisation's timezone — never derive it from UTC. */
export function todayInTimeZone(
  timeZone: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): BusinessDate {
  return toBusinessDate(now, timeZone);
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds. */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (instant.getTime() - instant.getMilliseconds());
}

/** UTC instant of local midnight of `date` in `timeZone`, for querying TIMESTAMPTZ columns. */
export function startOfDayInstant(date: BusinessDate, timeZone: string = DEFAULT_TIMEZONE): Date {
  const { year, month, day } = partsOf(date);
  const naiveUtc = Date.UTC(year, month - 1, day);
  const firstGuess = naiveUtc - timeZoneOffsetMs(new Date(naiveUtc), timeZone);
  // Re-evaluate once so DST transitions resolve correctly.
  return new Date(naiveUtc - timeZoneOffsetMs(new Date(firstGuess), timeZone));
}

export function addDays(date: BusinessDate, days: number): BusinessDate {
  const { year, month, day } = partsOf(date);
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * MS_PER_DAY);
  return businessDateFromParts(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

export function compareBusinessDates(a: BusinessDate, b: BusinessDate): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isBeforeBusinessDate(a: BusinessDate, b: BusinessDate): boolean {
  return compareBusinessDates(a, b) === -1;
}

export interface BusinessDateRange {
  /** Inclusive. */
  readonly start: BusinessDate;
  /** Inclusive. */
  readonly end: BusinessDate;
}

/** First and last calendar day of the month containing `date`. */
export function monthRangeOf(date: BusinessDate): BusinessDateRange {
  const { year, month } = partsOf(date);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: businessDateFromParts(year, month, 1),
    end: businessDateFromParts(year, month, lastDay),
  };
}

export function isWithinRange(date: BusinessDate, range: BusinessDateRange): boolean {
  return compareBusinessDates(date, range.start) >= 0 && compareBusinessDates(date, range.end) <= 0;
}

export interface FormatInstantOptions {
  readonly timeZone?: string;
  readonly locale?: string;
  readonly withTime?: boolean;
}

/** Display an instant in the viewer's timezone (default Asia/Taipei, zh-TW). */
export function formatInstant(instant: Date, options: FormatInstantOptions = {}): string {
  return new Intl.DateTimeFormat(options.locale ?? 'zh-TW', {
    timeZone: options.timeZone ?? DEFAULT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(options.withTime === true ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}),
  }).format(instant);
}

/** Display a business date without any timezone conversion. */
export function formatBusinessDate(date: BusinessDate, separator = '/'): string {
  return date.replaceAll('-', separator);
}
