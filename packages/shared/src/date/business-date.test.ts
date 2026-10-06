import { describe, expect, it } from 'vitest';
import {
  InvalidBusinessDateError,
  addDays,
  formatBusinessDate,
  formatInstant,
  isBeforeBusinessDate,
  isBusinessDate,
  isValidTimeZone,
  isWithinRange,
  monthRangeOf,
  parseBusinessDate,
  startOfDayInstant,
  toBusinessDate,
  todayInTimeZone,
} from './index.js';

describe('BusinessDate validation', () => {
  it.each(['2026-10-07', '2024-02-29', '2026-12-31'])('accepts %s', (value) => {
    expect(isBusinessDate(value)).toBe(true);
  });

  it.each([
    '2026-02-29',
    '2026-13-01',
    '2026-1-7',
    '2026/10/07',
    '20261007',
    '',
    '2026-10-07T00:00:00Z',
  ])('rejects %s', (value) => {
    expect(isBusinessDate(value)).toBe(false);
  });

  it('parseBusinessDate throws on invalid input', () => {
    expect(() => parseBusinessDate('2026-02-30')).toThrow(InvalidBusinessDateError);
  });
});

describe('Asia/Taipei boundaries (ADR-05)', () => {
  it('maps 00:00–08:00 Taipei to the Taipei calendar date, not the UTC date', () => {
    // 2026-10-01 07:30 in Taipei == 2026-09-30T23:30Z
    const instant = new Date('2026-09-30T23:30:00Z');
    expect(toBusinessDate(instant, 'Asia/Taipei')).toBe('2026-10-01');
    expect(toBusinessDate(instant, 'UTC')).toBe('2026-09-30');
  });

  it('computes "today" in the organisation timezone', () => {
    const lateNightUtc = new Date('2026-10-31T16:30:00Z'); // 2026-11-01 00:30 Taipei
    expect(todayInTimeZone('Asia/Taipei', lateNightUtc)).toBe('2026-11-01');
  });

  it('converts a business date to the UTC instant of local midnight', () => {
    const start = startOfDayInstant(parseBusinessDate('2026-10-01'), 'Asia/Taipei');
    expect(start.toISOString()).toBe('2026-09-30T16:00:00.000Z');
  });

  it('handles DST zones', () => {
    // New York switches to EDT on 2026-03-08.
    expect(
      startOfDayInstant(parseBusinessDate('2026-03-08'), 'America/New_York').toISOString(),
    ).toBe('2026-03-08T05:00:00.000Z');
    expect(
      startOfDayInstant(parseBusinessDate('2026-03-09'), 'America/New_York').toISOString(),
    ).toBe('2026-03-09T04:00:00.000Z');
  });
});

describe('date arithmetic', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays(parseBusinessDate('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addDays(parseBusinessDate('2024-03-01'), -1)).toBe('2024-02-29');
  });

  it('computes month ranges', () => {
    expect(monthRangeOf(parseBusinessDate('2026-02-14'))).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    });
    expect(monthRangeOf(parseBusinessDate('2024-02-14'))).toEqual({
      start: '2024-02-01',
      end: '2024-02-29',
    });
    const range = monthRangeOf(parseBusinessDate('2026-10-07'));
    expect(isWithinRange(parseBusinessDate('2026-10-31'), range)).toBe(true);
    expect(isWithinRange(parseBusinessDate('2026-11-01'), range)).toBe(false);
  });

  it('compares dates', () => {
    expect(
      isBeforeBusinessDate(parseBusinessDate('2026-10-06'), parseBusinessDate('2026-10-07')),
    ).toBe(true);
    expect(
      isBeforeBusinessDate(parseBusinessDate('2026-10-07'), parseBusinessDate('2026-10-07')),
    ).toBe(false);
  });
});

describe('display', () => {
  it('formats instants in Asia/Taipei by default', () => {
    const instant = new Date('2026-09-30T23:30:00Z');
    expect(formatInstant(instant)).toBe('2026/10/01');
    expect(formatInstant(instant, { withTime: true })).toContain('07:30');
  });

  it('formats business dates without timezone conversion', () => {
    expect(formatBusinessDate(parseBusinessDate('2026-10-07'))).toBe('2026/10/07');
  });

  it('validates timezones', () => {
    expect(isValidTimeZone('Asia/Taipei')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});
