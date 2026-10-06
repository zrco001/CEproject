import type { Money } from './money.js';

export const DEFAULT_LOCALE = 'zh-TW';
export const DEFAULT_CURRENCY = 'TWD';

/** TWD is displayed as whole dollars by default (D-09). */
export const DEFAULT_DISPLAY_FRACTION_DIGITS = 0;

export interface FormatMoneyOptions {
  readonly locale?: string;
  readonly currency?: string;
  readonly fractionDigits?: number;
  readonly withCurrencySymbol?: boolean;
}

/**
 * Locale-aware display. The amount is first rounded with decimal arithmetic and handed to
 * Intl.NumberFormat as a decimal string, so no floating point conversion happens.
 */
export function formatMoney(money: Money, options: FormatMoneyOptions = {}): string {
  const fractionDigits = options.fractionDigits ?? DEFAULT_DISPLAY_FRACTION_DIGITS;
  const formatter = new Intl.NumberFormat(options.locale ?? DEFAULT_LOCALE, {
    ...(options.withCurrencySymbol === true
      ? {
          style: 'currency',
          currency: options.currency ?? DEFAULT_CURRENCY,
          currencyDisplay: 'narrowSymbol',
        }
      : { style: 'decimal' }),
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return formatter.format(money.toFixed(fractionDigits) as Intl.StringNumericLiteral);
}

const UNITS = [
  { threshold: '100000000', divisor: '100000000', suffix: '億' },
  { threshold: '10000', divisor: '10000', suffix: '萬' },
] as const;

/**
 * Compact zh-TW amount for mobile cards: 8,500,000 → "850萬", 123,456,789 → "1.2億".
 * Keeps at most one fraction digit and drops a trailing ".0".
 */
export function formatMoneyCompactZhTW(money: Money): string {
  const sign = money.isNegative() ? '-' : '';
  const absolute = money.abs();
  for (const unit of UNITS) {
    if (absolute.greaterThanOrEqual(unit.threshold)) {
      const scaled = absolute.dividedBy(unit.divisor).toFixed(1).replace(/\.0$/, '');
      return `${sign}${scaled}${unit.suffix}`;
    }
  }
  return `${sign}${formatMoney(absolute)}`;
}
